// Spreadsheets: a workbook kept in Pages (a page of the kind "sheet"), as the server, the editor and the exports
// share it. A workbook is a list of sheets; a sheet keeps its cells by name ("B2"), each a value (a number, words,
// TRUE or FALSE) or a formula ("=SUM(B2:B9)") and how it looks, the widths of its columns, the heights of its rows,
// and the rows and columns that stay in view as it scrolls (frozen).
//
// normalizeBook takes what an agent or the editor sends, lenient about shorthand (rows from A1, a header row, a
// format per column, words typed as a person types them: "12%", "2026-01-31", "=B2*2"), and returns the workbook as
// it is kept, every value checked. computeBook works out what each formula gives, as Excel does: its operators,
// references to cells, ranges and other sheets, a long list of functions, dates as Excel's day numbers (1900 system).
// formatValue writes a value as its cell shows it. shiftFormula, adjustForInsert and adjustForDelete rewrite formulas
// as cells are copied, or rows and columns go in or out. Nothing here needs Node or a browser.

export const SHEET_LIMITS = { sheets: 50, cells: 200_000, rows: 20_000, cols: 500, text: 32_767, formula: 8_192, name: 31 };

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

export type NumFmt = 'general' | 'number' | 'percent' | 'currency' | 'date' | 'text';
export const NUM_FMTS: NumFmt[] = ['general', 'number', 'percent', 'currency', 'date', 'text'];

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
  /** Type size, in points. */
  size?: number;
}

export type CellValue = string | number | boolean;

export interface Cell {
  /** What it holds (none when it has a formula: that is worked out). */
  v?: CellValue;
  /** A formula, without its "=". */
  f?: string;
  s?: CellStyle;
}

export interface Sheet {
  id: string;
  name: string;
  /** By name: "A1", "B12". */
  cells: Record<string, Cell>;
  /** Columns' widths in px, by index from 0 (A). */
  cols?: Record<number, { w?: number }>;
  /** Rows' heights in px, by index from 0 (row 1). */
  rows?: Record<number, { h?: number }>;
  /** Rows (from the top) and columns (from the left) that stay in view. */
  freeze?: { rows?: number; cols?: number };
}

export interface Workbook {
  v: 1;
  sheets: Sheet[];
}

// ---- errors ------------------------------------------------------------------------------------------------

export type ErrCode = '#DIV/0!' | '#N/A' | '#NAME?' | '#NULL!' | '#NUM!' | '#REF!' | '#VALUE!' | '#CIRC!' | '#ERROR!';

/** A formula's error, as its cell shows it. #CIRC!: it needs itself; #ERROR!: it cannot be read. */
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

/** A value as its cell shows it, in the cell's number format. */
export function formatValue(v: Scalar | undefined, s?: CellStyle): string {
  if (v === null || v === undefined) return '';
  if (v instanceof CellError) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
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
    case 'date':
      return dateText(v);
    default:
      return s?.dp !== undefined ? fixed(v, s.dp, false) : generalNumber(v);
  }
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
    if (fmt === 'date') return dateText(v);
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

/** The format an Excel number format code stands for ("#,##0.00" → number, 2 decimals; "0%"; "$#,##0"; "yyyy-mm-dd"). */
export function fmtFromCode(code: string): Pick<CellStyle, 'fmt' | 'dp' | 'cur'> {
  const c = code.trim();
  if (!c || /^general$/i.test(c)) return {};
  if (c === '@') return { fmt: 'text' };
  // What is not in quotes, escaped or in brackets decides what it is.
  const bare = c.split(';')[0].replace(/"[^"]*"|\\.|\[[^\]]*\]/g, (m) => (m.startsWith('[$') ? m : ''));
  const dp = (/\.([0#?]+)/.exec(bare)?.[1].length ?? 0) as number;
  if (/[yd]|m{3,}|h|s/i.test(bare.replace(/\[\$[^\]]*\]/g, '')) && !/[0#?]/.test(bare.replace(/\[\$[^\]]*\]/g, ''))) return { fmt: 'date' };
  if (bare.includes('%')) return { fmt: 'percent', dp };
  const cur = /\[\$([^\]-]+)/.exec(c)?.[1] ?? /"([^"0-9#?]{1,4})"/.exec(c)?.[1] ?? /([$€£¥₹])/.exec(bare)?.[1];
  if (cur && /[0#?]/.test(bare)) return cur === '$' ? { fmt: 'currency', dp } : { fmt: 'currency', dp, cur: cur.trim() };
  if (/[0#?]/.test(bare)) return bare.includes(',') ? { fmt: 'number', dp } : dp ? { fmt: 'general', dp } : { fmt: 'general', dp: 0 };
  return {};
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
  date: { fmt: 'date' },
  datetime: { fmt: 'date' },
  time: { fmt: 'date' },
  text: { fmt: 'text' },
  string: { fmt: 'text' },
  '@': { fmt: 'text' },
};

/** A format as a style takes it: a name ("currency", "percent", "eur"), an Excel code, or { fmt, dp, cur }. */
function fmtOf(v: unknown): Pick<CellStyle, 'fmt' | 'dp' | 'cur'> | null {
  if (typeof v === 'string') {
    const a = FMT_ALIAS[v.trim().toLowerCase()];
    if (a) return a;
    const code = fmtFromCode(v);
    return code.fmt ? code : null;
  }
  if (!isObj(v)) return null;
  const base = fmtOf(v.fmt ?? v.format ?? v.type) ?? {};
  const out: Pick<CellStyle, 'fmt' | 'dp' | 'cur'> = { ...base };
  const dp = intIn(v.dp ?? v.decimals, 0, 10);
  if (dp !== undefined) out.dp = dp;
  if (typeof (v.cur ?? v.currency) === 'string') out.cur = String(v.cur ?? v.currency);
  return out;
}

const ALIGN: Record<string, CellStyle['align']> = { left: 'left', center: 'center', centre: 'center', middle: 'center', right: 'right' };
const VALIGN: Record<string, CellStyle['valign']> = { top: 'top', middle: 'middle', center: 'middle', centre: 'middle', bottom: 'bottom' };

/** The decimals a format shows when its style says none. */
export const DEFAULT_DP: Partial<Record<NumFmt, number>> = { number: 2, currency: 2, percent: 0 };

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
  const dp = intIn(v.dp ?? v.decimals, 0, 10) ?? f.dp;
  const cur = cleanCur(v.cur ?? v.currency) ?? cleanCur(f.cur);
  if (f.fmt && f.fmt !== 'general') s.fmt = f.fmt;
  // Decimals a format shows anyway are not kept (2 for numbers and amounts, none for percents).
  if (dp !== undefined && s.fmt !== 'date' && s.fmt !== 'text' && !(s.fmt && DEFAULT_DP[s.fmt] === dp)) s.dp = dp;
  if (cur && cur !== '$' && s.fmt === 'currency') s.cur = cur;
  const size = intIn(v.size ?? v.fontSize, 6, 72);
  if (size !== undefined && size !== FONT_PT) s.size = size;
  return Object.keys(s).length ? s : undefined;
}

/** Two styles as one: `b`'s values over `a`'s, in the kept order. */
export const mergeStyle = (a: CellStyle | undefined, b: CellStyle | undefined): CellStyle | undefined => (!b ? a : !a ? b : cleanStyle({ ...a, ...b }));

const STYLE_KEYS = ['b', 'bold', 'i', 'italic', 'u', 'underline', 's', 'strike', 'color', 'fill', 'background', 'align', 'valign', 'wrap', 'fmt', 'format', 'dp', 'cur', 'size'];

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
  return cell.v === undefined && cell.f === undefined && !cell.s ? null : cell;
}

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

function freezeOf(v: unknown): { rows?: number; cols?: number } | undefined {
  let rows: number | undefined;
  let cols: number | undefined;
  if (v === true) rows = 1;
  else if (typeof v === 'number') rows = intIn(v, 0, 50);
  else if (typeof v === 'string') {
    const p = parseRef(v);
    if (p) [rows, cols] = [Math.min(50, p.r), Math.min(20, p.c)];
  } else if (isObj(v)) {
    rows = intIn(v.rows ?? v.row ?? v.r, 0, 50);
    cols = intIn(v.cols ?? v.columns ?? v.col ?? v.c, 0, 20);
  }
  const out: { rows?: number; cols?: number } = {};
  if (rows) out.rows = rows;
  if (cols) out.cols = cols;
  return Object.keys(out).length ? out : undefined;
}

function sheetOf(raw: unknown, i: number, ids: Set<string>, names: string[], budget: Budget): Sheet | null {
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
      const s = cleanStyle(x);
      if (!rg || !s) continue;
      const r2 = Math.min(rg.r2, SHEET_LIMITS.rows - 1);
      const c2 = Math.min(rg.c2, SHEET_LIMITS.cols - 1);
      const area = (r2 - rg.r1 + 1) * (c2 - rg.c1 + 1);
      // A small range is styled cell by cell, empty ones too (a fill shows on them); a big one where it has cells.
      if (area <= 5000) for (let r = rg.r1; r <= r2; r++) for (let c = rg.c1; c <= c2; c++) styleAt(r, c, s, true);
      else for (const key of [...cells.keys()]) if (unpackR(key) >= rg.r1 && unpackR(key) <= r2 && unpackC(key) >= rg.c1 && unpackC(key) <= c2) styleAt(unpackR(key), unpackC(key), s, false);
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
        const { fmt: _f, dp: _d, cur: _c, ...rest } = cur.s ?? {};
        cells.set(key, { ...cur, s: general ? cleanStyle({ ...rest, dp: f.dp }) : cleanStyle({ ...rest, ...s }) });
      }
    }
  if (header) for (const key of [...cells.keys()]) if (unpackR(key) === r0) styleAt(r0, unpackC(key), { b: true }, false);

  // Columns' widths and rows' heights: kept ones by index, or an agent's by letters and row numbers.
  const cols: Record<number, { w: number }> = {};
  const setW = (c: number, w: unknown) => {
    const n = intIn(w, MIN_W, MAX_W);
    if (n !== undefined && c >= 0 && c < SHEET_LIMITS.cols && n !== COL_W) cols[c] = { w: n };
  };
  if (base && isObj(base.cols)) for (const [k, x] of Object.entries(base.cols)) if (/^\d+$/.test(k)) setW(Number(k), isObj(x) ? x.w : x);
  if (isObj(raw.cols)) for (const [k, x] of Object.entries(raw.cols)) if (/^\d+$/.test(k)) setW(Number(k), isObj(x) ? x.w : x);
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
  const rows: Record<number, { h: number }> = {};
  const setH = (r: number, h: unknown) => {
    const n = intIn(h, MIN_H, MAX_H);
    if (n !== undefined && r >= 0 && r < SHEET_LIMITS.rows && n !== ROW_H) rows[r] = { h: n };
  };
  if (base && isObj(base.rows)) for (const [k, x] of Object.entries(base.rows)) if (/^\d+$/.test(k)) setH(Number(k), isObj(x) ? x.h : x);
  if (isObj(raw.rows)) for (const [k, x] of Object.entries(raw.rows)) if (/^\d+$/.test(k)) setH(Number(k), isObj(x) ? x.h : x);
  const heights = raw.heights ?? raw.rowHeights;
  if (Array.isArray(heights)) heights.forEach((h, r) => setH(r0 + r, h));
  else if (isObj(heights)) for (const [k, h] of Object.entries(heights)) if (/^\d+$/.test(k) && Number(k) >= 1) setH(Number(k) - 1, h);

  const sheet: Sheet = { id, name, cells: {} };
  if (Object.keys(cols).length) sheet.cols = cols;
  if (Object.keys(rows).length) sheet.rows = rows;
  const freeze = raw.freeze !== undefined ? freezeOf(raw.freeze) : header ? { rows: r0 + 1 } : base?.freeze !== undefined ? freezeOf(base.freeze) : undefined;
  if (freeze) sheet.freeze = freeze;
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
  const sheets = list
    .slice(0, SHEET_LIMITS.sheets)
    .map((s, i) => sheetOf(s, i, ids, names, budget))
    .filter((s): s is Sheet => !!s);
  if (!sheets.length) sheets.push({ id: newId(), name: 'Sheet 1', cells: {} });
  const { cells, rows, cols } = budget.cut;
  if (cells) o.notes?.push(`${cells} cell${cells === 1 ? '' : 's'} left out: a workbook holds at most ${SHEET_LIMITS.cells.toLocaleString('en')} cells.`);
  if (rows) o.notes?.push(`Cells below row ${SHEET_LIMITS.rows.toLocaleString('en')} were left out.`);
  if (cols) o.notes?.push(`Cells right of column ${colName(SHEET_LIMITS.cols - 1)} were left out.`);
  return { v: 1, sheets };
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
  out.push(']}');
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
  | { k: 'nil' };

class ParseError extends Error {}

/** A function's name as this knows it: upper case, without the prefixes files give some (_xlfn., COM.MICROSOFT.). */
const fnName = (v: string) => v.toUpperCase().replace(/^(?:_XLFN\.|_XLWS\.|COM\.MICROSOFT\.|ORG\.OPENOFFICE\.|ORG\.LIBREOFFICE\.)+/, '');

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
  const primary = (): Node => {
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
        const args: Node[] = [];
        if (isP(toks[p], ')')) p++;
        else
          for (;;) {
            args.push(isP(toks[p], ',') || isP(toks[p], ')') ? { k: 'nil' } : level(0));
            const sep = toks[p++];
            if (isP(sep, ')')) break;
            if (!isP(sep, ',')) fail(`${t.v} is missing a , or a )`);
          }
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
  const moved = mapFormulas(book, (f, on) => moveRefs(f, on, sh.name, (ref) => ({ ...ref, a: bump(ref.a), ...(ref.b ? { b: bump(ref.b) } : {}) })));
  return {
    ...moved,
    sheets: moved.sheets.map((s) => {
      if (s.id !== sheetId) return s;
      const cells = moveCells(s, (r, c) => (row ? [r >= at ? r + count : r, c] : [r, c >= at ? c + count : c]));
      const shift = (i: number) => (i >= at ? i + count : i);
      const next = withSizes({ ...s, cells }, row ? s.cols : moveSizes(s.cols, shift, SHEET_LIMITS.cols), row ? moveSizes(s.rows, shift, SHEET_LIMITS.rows) : s.rows);
      if (s.freeze) {
        const fz = { ...s.freeze };
        if (row && fz.rows && at < fz.rows) fz.rows = Math.min(50, fz.rows + count);
        if (!row && fz.cols && at < fz.cols) fz.cols = Math.min(20, fz.cols + count);
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
  const moved = mapFormulas(book, (f, on) => moveRefs(f, on, sh.name, shrink));
  return {
    ...moved,
    sheets: moved.sheets.map((s) => {
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

/** A sheet renamed, and every formula that names it changed to the new name. */
export function renameSheet(book: Workbook, sheetId: string, name: string): Workbook {
  const sh = book.sheets.find((s) => s.id === sheetId);
  if (!sh) return book;
  const clean = uniqueSheetName(cleanSheetName(name), book.sheets.filter((s) => s.id !== sheetId).map((s) => s.name));
  if (clean === sh.name) return book;
  const old = sh.name.toLowerCase();
  const moved = mapFormulas(book, (f) =>
    rewrite(f, (t) => (t.k === 'ref' && t.ref.sheet !== undefined && t.ref.sheet.toLowerCase() === old ? `${quoteSheet(clean)}!${f.slice(t.ps, t.e)}` : undefined)),
  );
  return { ...moved, sheets: moved.sheets.map((s) => (s.id === sheetId ? { ...s, name: clean } : s)) };
}

/** A sheet taken out of the workbook: the references other sheets had to it become #REF!. */
export function removeSheet(book: Workbook, sheetId: string): Workbook {
  const sh = book.sheets.find((s) => s.id === sheetId);
  if (!sh || book.sheets.length < 2) return book;
  const old = sh.name.toLowerCase();
  const rest = { ...book, sheets: book.sheets.filter((s) => s.id !== sheetId) };
  return mapFormulas(rest, (f) => rewrite(f, (t) => (t.k === 'ref' && t.ref.sheet !== undefined && t.ref.sheet.toLowerCase() === old ? '#REF!' : undefined)));
}

/** The formula for a file: newer functions named as Excel's files name them (_xlfn.XLOOKUP), references to sheets that are not there as #REF!. */
export function fileFormula(f: string, sheetNames: Set<string>): string {
  return rewrite(f, (t) => {
    if (t.k === 'fn') {
      const n = fnName(t.v);
      return XLFN.has(n) ? `_xlfn.${n}` : n === t.v ? undefined : n;
    }
    if (t.k === 'ref' && t.ref.sheet !== undefined && !sheetNames.has(t.ref.sheet.toLowerCase())) return '#REF!';
    return undefined;
  });
}

/** A formula from a file: without the prefixes Excel's files give newer functions (_xlfn.XLOOKUP is XLOOKUP). */
export function formulaFromFile(f: string): string {
  return rewrite(f.replace(/^=/, ''), (t) => (t.k === 'fn' && /^(_xl|com\.microsoft\.|org\.(open|libre)office\.)/i.test(t.v) ? fnName(t.v) : undefined));
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
]);

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
export type Val = Scalar | Rg | Arr;

const isRg = (v: Val): v is Rg => typeof v === 'object' && v !== null && (v as Rg).k === 'rg';
const isArr = (v: Val): v is Arr => typeof v === 'object' && v !== null && (v as Arr).k === 'arr';
const multi = (v: Val) => isArr(v) || (isRg(v) && (v.r1 !== v.r2 || v.c1 !== v.c2));

/** Where a formula is being worked out: its sheet and cell, and how many random numbers it drew so far. */
export interface Ctx {
  si: number;
  r: number;
  c: number;
  n: number;
}

export function toNum(v: Scalar): number | CellError {
  if (typeof v === 'number') return v;
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof CellError) return v;
  const t = parseNumberText(v);
  return t && typeof t.v === 'number' ? t.v : E.VALUE;
}

export function toText(v: Scalar): string | CellError {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v === null) return '';
  return v;
}

export function toBool(v: Scalar): boolean | CellError {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null) return false;
  if (v instanceof CellError) return v;
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
export class Calc {
  book!: Workbook;
  private idx: Map<number, Cell>[] = [];
  private memo: Map<number, Scalar>[] = [];
  private busy: Set<number>[] = [];
  private ext: ({ rows: number; cols: number } | null)[] = [];
  private sorted: (number[] | null)[] = [];
  private byName = new Map<string, number>();
  private frames = 0;
  private rowsMax = -1;
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
    this.idx = book.sheets.map((sh) => {
      const m = new Map<number, Cell>();
      for (const k in sh.cells) {
        const n = keyOf(k);
        if (n >= 0) m.set(n, sh.cells[k]);
      }
      return m;
    });
    this.byName = new Map(book.sheets.map((s, i) => [s.name.toLowerCase(), i]));
    this.ext = book.sheets.map(() => null);
    this.sorted = book.sheets.map(() => null);
    this.rowsMax = -1;
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
    this.memo = this.book.sheets.map(() => new Map());
    this.busy = this.book.sheets.map(() => new Set());
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

  /** The cell itself (what it holds), or undefined. */
  cellAt(si: number, r: number, c: number): Cell | undefined {
    return this.idx[si]?.get(pack(r, c));
  }

  /** What a cell shows: its formula's result, else what it holds; null when it is empty. */
  value(si: number, r: number, c: number): Scalar {
    if (r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) return E.REF;
    const key = pack(r, c);
    const cell = this.idx[si]?.get(key);
    if (!cell) return null;
    if (cell.f === undefined) return cell.v ?? null;
    return this.top(si, key);
  }

  /** By the sheet's id and the cell's name ("B2"). */
  get(sheetId: string, name: string): Scalar {
    const si = this.book.sheets.findIndex((s) => s.id === sheetId);
    const p = parseRef(name);
    return si < 0 || !p ? E.REF : this.value(si, p.r, p.c);
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
    if (!cell) return null;
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
    try {
      const s = this.sc(this.ev(node, cx), cx);
      return s === null ? 0 : s;
    } catch (e) {
      if (e instanceof Deep) throw e;
      // A formula this cannot work out (far too big, say) is an error in its cell, not in the others'.
      this.frames = frames;
      return E.VALUE;
    }
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
      case 'name':
        v = E.NAME;
        break;
      case 'arr':
        v = { k: 'arr', h: n.rows.length, w: n.rows[0]?.length ?? 0, d: n.rows.flat() };
        break;
      case 'r':
        v = this.refVal(n.sheet, n.a, n.b, cx);
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
        v = fn ? fn(this, n.args, cx) : E.NAME;
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
    return v;
  }

  /** Values in rows and columns, from cells (whole columns as far as the workbook's rows go), an array or one value. */
  arr(v: Val): Arr | CellError {
    if (isArr(v)) return v;
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
      f(v, 0, 0);
      return;
    }
    const idx = this.idx[v.si];
    if (!idx) return;
    if (blanks) {
      const a = this.arr(v);
      if (a instanceof CellError) return void f(a, 0, 0);
      return this.each(a, f);
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
    if (!isRg(v)) return { h: 1, w: 1, hh: 1, ww: 1, get: (i, j) => (i === 0 && j === 0 ? v : null) };
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
    const v = c.ev(n, cx);
    if (isRg(v) || isArr(v)) {
      const e = scan(c, v, (x) => typeof x === 'number' && out.push(x));
      if (e) return e;
    } else if (v !== null) {
      const x = toNum(v);
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
      const v = c.ev(x, cx);
      if (isRg(v) || isArr(v)) c.each(v, (s) => void (isNum(s) && n++));
      else if (isNum(v) || typeof v === 'boolean' || (typeof v === 'string' && !(toNum(v) instanceof CellError))) n++;
    }
    return n;
  }),
  COUNTA: def(1, 255, (c, a, cx) => {
    let n = 0;
    for (const x of a) {
      if (x.k === 'nil') continue;
      const v = c.ev(x, cx);
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
      const v = c.arr(c.ev(x, cx));
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
    const v = c.ev(n, cx);
    if (isRg(v) || isArr(v)) {
      const e = scan(c, v, (s) => {
        if (typeof s === 'boolean') bs.push(s);
        else if (typeof s === 'number') bs.push(s !== 0);
      });
      if (e) return e;
    } else {
      const b = toBool(v);
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
    const v = c.ev(n, cx);
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
      const t = toText(v);
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

const FNS: Record<string, Fn> = { ...MATH_FNS, ...LOGIC_FNS, ...INFO_FNS, ...LOOKUP_FNS, ...TEXT_FNS, ...DATE_FNS, ...MONEY_FNS };
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
