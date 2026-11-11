// What a sheet's rules make of its cells, worked out from the workbook as it is now (shared/sheets.ts keeps the rules
// and checks them): the rows a filter hides; the look conditional formatting gives a cell (the first condition that
// holds gives its look, and a colour scale or data bars show with it); what a cell may take (a list's options, a
// checkbox, stars) and whether what it holds is allowed; and which cells are merged into which. The editor, the
// workbook's page and the Excel export all use these. Nothing here needs Node or a browser.
import {
  setFilterHook,
  CellError,
  colIndex,
  compare,
  formatValue,
  parseDate,
  parseInput,
  parseRange,
  rectsOf,
  refName,
  sourceOf,
  toBool,
  type Calc,
  type Cond,
  type CondStyle,
  type ListOption,
  type Rect,
  type ScalePoint,
  type Scalar,
  type Sheet,
  type Validation,
} from './sheets.ts';

const inRect = (x: Rect, r: number, c: number) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2;
const blank = (v: Scalar) => v === null || v === '';

// ---- conditions -------------------------------------------------------------------------------------------------

/** Where a condition is checked: the cell, and the first cell of its range (a formula is written for that one). */
export interface At {
  r: number;
  c: number;
  r0: number;
  c0: number;
}

/** A condition's value as worked out for a cell: a formula's result, or the words read as a person types them. */
function argOf(calc: Calc, si: number, a: string | undefined, at: At): Scalar {
  if (a === undefined) return null;
  if (a.startsWith('=')) return calc.evalAt(si, a.slice(1), at.r, at.c, at.r0, at.c0);
  const t = parseInput(a);
  return t.v ?? null;
}

/** Today as a day number, and the day a date word stands for ("week": a week ago). */
function dayOf(calc: Calc, word: string): number | null {
  const today = Math.floor(calc.now);
  switch (word) {
    case 'today':
      return today;
    case 'tomorrow':
      return today + 1;
    case 'yesterday':
      return today - 1;
    case 'week':
      return today - 7;
    case 'month':
      return today - 30;
    case 'year':
      return today - 365;
  }
  return null;
}

/** Whether a cell's value meets a condition (one that looks at the cell alone: not dup, top, above…). `shown`: the value as its cell shows it. */
export function condHolds(calc: Calc, si: number, cond: Cond, v: Scalar, shown: string, at: At): boolean {
  if (v instanceof CellError && cond.op !== 'formula' && cond.op !== 'notEmpty') return false;
  const text = shown.toLowerCase();
  const word = (x: string | undefined) => {
    const s = argOf(calc, si, x, at);
    return s === null ? '' : formatValue(s).toLowerCase();
  };
  switch (cond.op) {
    case 'empty':
      return blank(v);
    case 'notEmpty':
      return !blank(v);
    case 'contains':
      return text.includes(word(cond.a));
    case 'notContains':
      return !text.includes(word(cond.a));
    case 'starts':
      return text.startsWith(word(cond.a));
    case 'ends':
      return text.endsWith(word(cond.a));
    case 'is':
      return text === word(cond.a);
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (blank(v) && cond.op !== 'neq' && cond.op !== 'eq') return false;
      const a = argOf(calc, si, cond.a, at);
      if (a instanceof CellError) return false;
      const k = compare(v, a);
      return cond.op === 'eq' ? k === 0 : cond.op === 'neq' ? k !== 0 : cond.op === 'gt' ? k > 0 && sameKind(v, a) : cond.op === 'gte' ? k >= 0 && sameKind(v, a) : cond.op === 'lt' ? k < 0 && sameKind(v, a) : k <= 0 && sameKind(v, a);
    }
    case 'between':
    case 'notBetween': {
      if (blank(v)) return cond.op === 'notBetween';
      const a = argOf(calc, si, cond.a, at);
      const b = argOf(calc, si, cond.b, at);
      if (a instanceof CellError || b instanceof CellError) return false;
      const [lo, hi] = compare(a, b) <= 0 ? [a, b] : [b, a];
      const inside = compare(v, lo) >= 0 && compare(v, hi) <= 0 && sameKind(v, lo);
      return cond.op === 'between' ? inside : !inside;
    }
    case 'dateIs':
    case 'before':
    case 'after': {
      if (typeof v !== 'number') return false;
      const a = cond.a ?? '';
      const day = Math.floor(v);
      const named = dayOf(calc, a);
      if (cond.op === 'dateIs' && (a === 'week' || a === 'month' || a === 'year')) return day >= named! && day <= Math.floor(calc.now);
      const d = named ?? (a.startsWith('=') ? toDay(argOf(calc, si, a, at)) : parseDate(a));
      if (d === null) return false;
      return cond.op === 'dateIs' ? day === Math.floor(d) : cond.op === 'before' ? day < Math.floor(d) : day > Math.floor(d);
    }
    case 'formula': {
      const r = argOf(calc, si, cond.a, at);
      const b = r instanceof CellError ? false : toBool(r);
      return b === true;
    }
  }
  return false;
}

const toDay = (v: Scalar): number | null => (typeof v === 'number' ? v : typeof v === 'string' ? parseDate(v) : null);
/** Greater and less mean something between two numbers, or two words; a number is not "greater" than words. */
const sameKind = (a: Scalar, b: Scalar) => (typeof a === 'number') === (typeof b === 'number');

// ---- filters ------------------------------------------------------------------------------------------------------

/** What a cell shows, for filtering: its value as formatted ("" when empty). */
export const shownAt = (sh: Sheet, si: number, calc: Calc, r: number, c: number): string => {
  const cell = sh.cells[refName(r, c)];
  if (!cell || (cell.v === undefined && cell.f === undefined)) return '';
  return formatValue(calc.value(si, r, c), cell.s);
};

/** The rows a sheet's filter hides (never its header row). */
export function filterHidden(sh: Sheet, si: number, calc: Calc): Set<number> {
  const out = new Set<number>();
  const f = sh.filter;
  const x = f ? parseRange(f.range) : null;
  if (!f || !x || !f.cols) return out;
  const cols = Object.entries(f.cols).map(([k, fc]) => ({ c: colIndex(k), hide: fc.hide?.length ? new Set(fc.hide.map((h) => h.toLowerCase())) : null, when: fc.when }));
  const last = Math.min(x.r2, Math.max(x.r1, calc.extent(si).rows - 1));
  for (let r = x.r1 + 1; r <= last; r++) {
    for (const k of cols) {
      if (k.c < 0) continue;
      const shown = shownAt(sh, si, calc, r, k.c);
      if (k.hide?.has(shown.toLowerCase())) {
        out.add(r);
        break;
      }
      if (k.when && !condHolds(calc, si, k.when, calc.value(si, r, k.c), shown, { r, c: k.c, r0: x.r1 + 1, c0: k.c })) {
        out.add(r);
        break;
      }
    }
  }
  return out;
}

/** A filtered column's values, as their cells show them, with how many rows have each (for "filter by values"); empty ones as "". */
export function columnValues(sh: Sheet, si: number, calc: Calc, x: Rect, c: number): { v: string; n: number }[] {
  const counts = new Map<string, { v: string; n: number }>();
  const last = Math.min(x.r2, Math.max(x.r1, calc.extent(si).rows - 1));
  for (let r = x.r1 + 1; r <= last; r++) {
    const v = shownAt(sh, si, calc, r, c);
    const k = v.toLowerCase();
    const got = counts.get(k);
    if (got) got.n++;
    else counts.set(k, { v, n: 1 });
  }
  return [...counts.values()].sort((a, b) => (a.v === '' ? 1 : b.v === '' ? -1 : a.v.localeCompare(b.v, undefined, { numeric: true, sensitivity: 'base' })));
}

/** Rows hidden: by hand, and by the filter. */
export function hiddenRows(sh: Sheet, si: number, calc: Calc): Set<number> {
  const out = filterHidden(sh, si, calc);
  for (const [k, v] of Object.entries(sh.rows ?? {})) if (v.hidden) out.add(Number(k));
  return out;
}

/** Columns hidden by hand. */
export function hiddenCols(sh: Sheet): Set<number> {
  const out = new Set<number>();
  for (const [k, v] of Object.entries(sh.cols ?? {})) if (v.hidden) out.add(Number(k));
  return out;
}

// ---- conditional formatting -------------------------------------------------------------------------------------------

/** What conditional formatting gives a cell: a look, a fill from a colour scale, a data bar (from and to: fractions of the cell's width). */
export interface CfLook {
  style?: CondStyle;
  scale?: string;
  bar?: { color: string; from: number; to: number };
}

interface RuleStats {
  nums: number[];
  min: number;
  max: number;
  avg: number;
  counts: Map<string, number>;
  /** The value a top or bottom rule's cells must reach. */
  cut?: number;
}

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => hex2(p(a, i) + (p(b, i) - p(a, i)) * t)).join('')}`;
}

/** The k-th percentile (0–100) of sorted numbers, as Excel's PERCENTILE.INC. */
function pctile(sorted: number[], k: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * Math.max(0, Math.min(1, k / 100));
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
}

/** A sheet's conditional formatting, ready to ask of each cell; what each rule needs of its whole range is worked out once. */
export class CondFormats {
  private rules: { rects: Rect[]; i: number }[];
  private stats = new Map<number, RuleStats>();

  constructor(
    private sh: Sheet,
    private si: number,
    private calc: Calc,
  ) {
    this.rules = (sh.conditional ?? []).map((r, i) => ({ rects: rectsOf(r.range), i }));
  }

  get any(): boolean {
    return this.rules.length > 0;
  }

  private statsOf(i: number): RuleStats {
    let s = this.stats.get(i);
    if (s) return s;
    const nums: number[] = [];
    const counts = new Map<string, number>();
    const e = this.calc.extent(this.si);
    for (const x of this.rules[i].rects) {
      const r2 = Math.min(x.r2, e.rows - 1);
      const c2 = Math.min(x.c2, e.cols - 1);
      for (let r = x.r1; r <= r2; r++)
        for (let c = x.c1; c <= c2; c++) {
          const v = this.calc.value(this.si, r, c);
          if (typeof v === 'number') nums.push(v);
          if (!blank(v) && !(v instanceof CellError)) {
            const k = shownAt(this.sh, this.si, this.calc, r, c).toLowerCase();
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        }
    }
    nums.sort((a, b) => a - b);
    s = { nums, min: nums[0] ?? 0, max: nums[nums.length - 1] ?? 0, avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0, counts };
    const w = this.sh.conditional![i].when;
    if (w && (w.op === 'top' || w.op === 'bottom') && nums.length) {
      const n = Number(w.a ?? 10);
      const k = Math.max(1, Math.min(nums.length, w.b === '%' ? Math.floor((nums.length * n) / 100) || 1 : n));
      s.cut = w.op === 'top' ? nums[nums.length - k] : nums[k - 1];
    }
    this.stats.set(i, s);
    return s;
  }

  private point(p: ScalePoint, s: RuleStats, place: 'min' | 'mid' | 'max'): number {
    const at = p.at ?? (place === 'mid' ? 'pctile' : place);
    const v = p.v ?? 50;
    return at === 'min' ? s.min : at === 'max' ? s.max : at === 'num' ? v : at === 'pct' ? s.min + ((s.max - s.min) * v) / 100 : pctile(s.nums, v);
  }

  /** The look a cell gets, or null. */
  at(r: number, c: number): CfLook | null {
    if (!this.rules.length) return null;
    let look: CfLook | null = null;
    let v: Scalar | undefined;
    let shown: string | undefined;
    const value = () => (v === undefined ? (v = this.calc.value(this.si, r, c)) : v);
    const text = () => (shown === undefined ? (shown = shownAt(this.sh, this.si, this.calc, r, c)) : shown);
    for (const { rects, i } of this.rules) {
      const x = rects.find((q) => inRect(q, r, c));
      if (!x) continue;
      const rule = this.sh.conditional![i];
      if (rule.scale) {
        if (look?.scale !== undefined) continue;
        const n = value();
        if (typeof n !== 'number') continue;
        const s = this.statsOf(i);
        const lo = this.point(rule.scale.min, s, 'min');
        const hi = this.point(rule.scale.max, s, 'max');
        let color: string;
        if (rule.scale.mid) {
          const mid = this.point(rule.scale.mid, s, 'mid');
          color = n <= mid ? mix(rule.scale.min.color, rule.scale.mid.color, mid > lo ? (Math.max(lo, n) - lo) / (mid - lo) : 1) : mix(rule.scale.mid.color, rule.scale.max.color, hi > mid ? (Math.min(hi, n) - mid) / (hi - mid) : 1);
        } else color = mix(rule.scale.min.color, rule.scale.max.color, hi > lo ? (Math.min(hi, Math.max(lo, n)) - lo) / (hi - lo) : 1);
        (look ??= {}).scale = color;
        continue;
      }
      if (rule.bar) {
        if (look?.bar) continue;
        const n = value();
        if (typeof n !== 'number') continue;
        const s = this.statsOf(i);
        const lo = Math.min(0, s.min);
        const hi = Math.max(0, s.max);
        const span = hi - lo || 1;
        const zero = (0 - lo) / span;
        const end = (n - lo) / span;
        (look ??= {}).bar = { color: rule.bar.color, from: Math.min(zero, end), to: Math.max(zero, end) };
        continue;
      }
      if (look?.style || !rule.when || !rule.style) continue;
      const w = rule.when;
      let holds: boolean;
      switch (w.op) {
        case 'dup':
        case 'unique': {
          const val = value();
          if (blank(val) || val instanceof CellError) holds = false;
          else {
            const n = this.statsOf(i).counts.get(text().toLowerCase()) ?? 0;
            holds = w.op === 'dup' ? n > 1 : n === 1;
          }
          break;
        }
        case 'top':
        case 'bottom': {
          const val = value();
          const s = this.statsOf(i);
          holds = typeof val === 'number' && s.cut !== undefined && (w.op === 'top' ? val >= s.cut : val <= s.cut);
          break;
        }
        case 'above':
        case 'below': {
          const val = value();
          const s = this.statsOf(i);
          holds = typeof val === 'number' && s.nums.length > 0 && (w.op === 'above' ? val > s.avg : val < s.avg);
          break;
        }
        default:
          holds = condHolds(this.calc, this.si, w, value(), text(), { r, c, r0: x.r1, c0: x.c1 });
      }
      if (holds) (look ??= {}).style = rule.style;
    }
    return look;
  }
}

// ---- what cells take ------------------------------------------------------------------------------------------------

/** A sheet's rules for what cells take, ready to ask which applies to a cell (the first that covers it). */
export class Rules {
  private list: { rects: Rect[]; rule: Validation }[];
  constructor(sh: Sheet) {
    this.list = (sh.validation ?? []).map((rule) => ({ rects: rectsOf(rule.range), rule }));
  }
  get any(): boolean {
    return this.list.length > 0;
  }
  /** The rule for a cell, with its range's first cell. */
  at(r: number, c: number): { rule: Validation; r0: number; c0: number } | null {
    for (const { rects, rule } of this.list) {
      const x = rects.find((q) => inRect(q, r, c));
      if (x) return { rule, r0: x.r1, c0: x.c1 };
    }
    return null;
  }
}

/** A list's options: its own, or the values of the range it names (as they show, once each). */
export function listOptions(calc: Calc, si: number, rule: Validation): ListOption[] {
  if (rule.options) return rule.options;
  const src = rule.source ? sourceOf(rule.source) : null;
  if (!src) return [];
  const s = src.sheet === undefined ? si : calc.sheetIndex(src.sheet);
  if (s < 0) return [];
  const sh = calc.book.sheets[s];
  const e = calc.extent(s);
  const out: ListOption[] = [];
  const seen = new Set<string>();
  for (let r = src.x.r1; r <= Math.min(src.x.r2, e.rows - 1); r++)
    for (let c = src.x.c1; c <= Math.min(src.x.c2, e.cols - 1); c++) {
      const v = shownAt(sh, s, calc, r, c).trim();
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      out.push({ v });
      if (out.length >= 500) return out;
    }
  return out;
}

/** Whether what a cell holds is allowed by its rule (an empty cell always is). */
export function allowed(calc: Calc, si: number, rule: Validation, v: Scalar, shown: string, at: At): boolean {
  if (blank(v)) return true;
  if (v instanceof CellError) return false;
  switch (rule.type) {
    case 'list': {
      const t = shown.trim().toLowerCase();
      return listOptions(calc, si, rule).some((o) => o.v.toLowerCase() === t);
    }
    case 'checkbox':
      return typeof v === 'boolean';
    case 'rating':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= (rule.max ?? 5);
    case 'number':
    case 'date':
      if (typeof v !== 'number') return false;
      return !rule.when || condHolds(calc, si, rule.when, v, shown, at);
    case 'length': {
      const n = shown.length;
      return !rule.when || condHolds(calc, si, rule.when, n, String(n), at);
    }
    case 'formula':
      return !rule.when || condHolds(calc, si, rule.when, v, shown, at);
  }
  return true;
}

/** Whether a checkbox's value is ticked: TRUE (or the words "true"). */
export const isTicked = (v: Scalar) => v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');

// ---- merged cells ---------------------------------------------------------------------------------------------------

/** A sheet's merged ranges, found by any cell in them. */
export class Merges {
  readonly list: Rect[];
  private byRow = new Map<number, Rect[]>();
  constructor(merges: string[] | undefined) {
    this.list = (merges ?? []).flatMap((m) => parseRange(m) ?? []);
    for (const x of this.list)
      for (let r = x.r1; r <= Math.min(x.r2, x.r1 + 20_000); r++) {
        const row = this.byRow.get(r);
        if (row) row.push(x);
        else this.byRow.set(r, [x]);
      }
  }
  /** The merge a cell is in, or null. */
  at(r: number, c: number): Rect | null {
    const row = this.byRow.get(r);
    if (!row) return null;
    for (const x of row) if (c >= x.c1 && c <= x.c2) return x;
    return null;
  }
  /** A rectangle grown to take in whole every merge it touches (a selection). */
  grow(x: Rect): Rect {
    if (!this.list.length) return x;
    const out = { ...x };
    for (let changed = true, n = 0; changed && n < 50; n++) {
      changed = false;
      for (const m of this.list) {
        if (m.r1 > out.r2 || m.r2 < out.r1 || m.c1 > out.c2 || m.c2 < out.c1) continue;
        if (m.r1 < out.r1 || m.r2 > out.r2 || m.c1 < out.c1 || m.c2 > out.c2) {
          out.r1 = Math.min(out.r1, m.r1);
          out.r2 = Math.max(out.r2, m.r2);
          out.c1 = Math.min(out.c1, m.c1);
          out.c2 = Math.max(out.c2, m.c2);
          changed = true;
        }
      }
    }
    return out;
  }
}

// SUBTOTAL leaves out the rows a filter hides: the calculator asks for them here.
setFilterHook(filterHidden);
