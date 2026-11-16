// Answer cards that read their numbers from a spreadsheet of the Library or a data file, instead of holding them. A card's
// data says where they are (`from`: a spreadsheet by its name or id, a tab and a range, or a CSV, TSV, JSON or JSONL file)
// and what of them it shows: columns by their headings, sums and counts (`sum(Revenue)`), groups (`groupBy`), a filter
// (`where: "Region = 'EU'"`, in a small language of its own read here: nothing is run), an order (`sort`) and a limit.
// The server (server/answers/data.ts) reads the source into a DataTable, and resolveRef works out what the card shows and
// writes it in the UI's own shape (a table's columns and rows, a chart's labels and series, a ranking's items…), so the
// views draw it as they draw numbers typed in. Shared: the server resolves, the tests check each UI's mapping, and the
// specs (index.ts) describe it to agents with an example for each UI that takes one (REF_UIS).
import { binValues, quantile } from './bins.ts';

export type Cell = string | number | boolean | null;

/** What a column's cells are, as its source says (a spreadsheet's number format): how a table writes them. */
export interface ColHint {
  type?: 'money' | 'percent' | 'date';
  /** Money's currency: a code ("EUR") or a sign ("€"). */
  currency?: string;
  /** After numbers ("%", when a file wrote "12%"). */
  unit?: string;
}

/** A source's rows, column by column: numbers in a Float64Array (NaN for an empty cell), anything else as it is. */
export interface DataColumn {
  name: string;
  nums?: Float64Array;
  vals?: Cell[];
  hint?: ColHint;
}

export interface DataTable {
  columns: DataColumn[];
  rows: number;
  /** More rows were in the source than are read (MAX_REF_ROWS). */
  cut?: boolean;
}

/** The UIs that take a reference in place of their values. */
export const REF_UIS = new Set(['table', 'chart', 'stats', 'ranking', 'distribution', 'map-values']);

/** How much a reference reads, and how much of what it works out reaches a card. */
export const REF_LIMITS = {
  /** A file's size (a JSON file, read whole at once, less). */
  fileBytes: 50 * 1024 * 1024,
  jsonBytes: 20 * 1024 * 1024,
  /** Rows read from a source; past them the rest is left out (and the card says so). */
  rows: 1_000_000,
  columns: 500,
  /** A table's rows, a chart's labels and a scatter's points, a ranking's items, a map's points, a distribution's values. */
  tableRows: 1000,
  chartLabels: 1000,
  points: 5000,
  series: 8,
  ranking: 100,
  mapPoints: 2000,
  values: 50_000,
  stats: 8,
  trend: 24,
};

/** What a reference could not do, in words for the person reading the card (and the agent that wrote it). */
export class RefError extends Error {}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const fmt = (n: number) => n.toLocaleString('en-US');

// ---- where the data is ---------------------------------------------------------------------------------------------

/** A source as a card names it: a spreadsheet of the Library (its name or id, a tab, a range) or a file. */
export interface RefSource {
  sheet?: string;
  tab?: string;
  range?: string;
  file?: string;
}

const FILE_EXT = /\.(csv|tsv|tab|txt|json|jsonl|ndjson|geojson)$/i;

/** The source a card's `from` names, or null when it names none. A string is a file (by its ending) or a spreadsheet's name. */
export function refSource(from: unknown): RefSource | null {
  if (typeof from === 'string') {
    const s = from.trim();
    if (!s) return null;
    return FILE_EXT.test(s) ? { file: s } : { sheet: s };
  }
  if (!isObj(from)) return null;
  const file = text(from.file ?? from.path);
  if (file) return { file };
  const sheet = text(from.sheet ?? from.spreadsheet ?? from.id ?? from.page);
  if (!sheet) return null;
  const tab = text(from.tab);
  const range = text(from.range);
  return { sheet, ...(tab ? { tab } : {}), ...(range ? { range } : {}) };
}

/** Whether a card's data reads from a source (a `from` that names one). */
export const isDataRef = (data: unknown): boolean => isObj(data) && refSource(data.from) !== null;

// ---- building a table ----------------------------------------------------------------------------------------------

/** Words a column holds again and again (a region, a status) are kept once; past this many different ones, no longer. */
const INTERN_MAX = 50_000;

class ColumnBuilder {
  nums: Float64Array | null = new Float64Array(256);
  vals: Cell[] | null = null;
  n = 0;
  private seen = new Map<string, string>();
  constructor(public name: string) {}
  push(v: Cell) {
    if (typeof v === 'string') {
      if (v === '') v = null;
      else if (this.seen.size < INTERN_MAX) {
        const had = this.seen.get(v);
        if (had !== undefined) v = had;
        else this.seen.set(v, v);
      }
    }
    if (this.nums) {
      if (v === null || typeof v === 'number') {
        if (this.n >= this.nums.length) {
          const next = new Float64Array(this.nums.length * 2);
          next.set(this.nums);
          this.nums = next;
        }
        this.nums[this.n++] = v === null || !Number.isFinite(v) ? NaN : v;
        return;
      }
      // The first cell that is not a number: the column holds anything from here on.
      const list: Cell[] = new Array(this.n);
      for (let i = 0; i < this.n; i++) list[i] = Number.isNaN(this.nums[i]) ? null : this.nums[i];
      this.vals = list;
      this.nums = null;
    }
    this.vals!.push(v);
    this.n++;
  }
  done(rows: number, hint?: ColHint): DataColumn {
    while (this.n < rows) this.push(null);
    const out: DataColumn = { name: this.name };
    if (this.nums) out.nums = this.nums.length === rows ? this.nums : this.nums.slice(0, rows);
    else out.vals = this.vals!;
    if (hint && (hint.type || hint.currency || hint.unit)) out.hint = hint;
    return out;
  }
}

/** Headings as a table keeps them: none empty ("Column C"), none twice ("Revenue 2"). */
export function cleanHeadings(raw: unknown[], letter: (i: number) => string = (i) => String(i + 1)): string[] {
  const taken = new Set<string>();
  return raw.map((h, i) => {
    let name = String(h ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!name) name = `Column ${letter(i)}`;
    let n = name;
    for (let k = 2; taken.has(n.toLowerCase()); k++) n = `${name} ${k}`;
    taken.add(n.toLowerCase());
    return n;
  });
}

/** A table made row by row: what each source reader fills. */
export class TableBuilder {
  private cols: ColumnBuilder[];
  rows = 0;
  cut = false;
  hints: ColHint[] = [];
  constructor(headings: string[]) {
    this.cols = headings.slice(0, REF_LIMITS.columns).map((h) => new ColumnBuilder(h));
  }
  get full() {
    return this.rows >= REF_LIMITS.rows;
  }
  /** A row's cells in the headings' order; false once the table is full (the rest is left out). */
  add(cells: Cell[]): boolean {
    if (this.full) {
      this.cut = true;
      return false;
    }
    for (let c = 0; c < this.cols.length; c++) this.cols[c].push(c < cells.length ? (cells[c] ?? null) : null);
    this.rows++;
    return true;
  }
  done(): DataTable {
    return { columns: this.cols.map((c, i) => c.done(this.rows, this.hints[i])), rows: this.rows, ...(this.cut ? { cut: true } : {}) };
  }
}

/** A table from rows of cells, the first row its headings: for tests, and small sources. */
export function tableOf(rows: Cell[][]): DataTable {
  const b = new TableBuilder(cleanHeadings(rows[0] ?? []));
  for (const r of rows.slice(1)) b.add(r);
  return b.done();
}

const NUM = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$|^[+-]?\.\d+$/;
const MONEY = /^([+-]?)\s*([$€£¥₹])\s*([\d,]*\.?\d+)$/;

/**
 * A field of a text file as a cell: a number when it is written as one ("1,250.5", "-3e2", "$40", "12%": 12, its column
 * then shows %), else the words as they are (dates stay words: "2026-01-31" sorts and compares as written). An id with
 * leading zeros (007) or a long run of digits (a card number) stays words.
 */
export function fieldCell(s: string, hint?: ColHint): Cell {
  const t = s.trim();
  if (!t) return null;
  if (t.length > 40 || !/\d/.test(t)) return s;
  let m: RegExpExecArray | null;
  if (NUM.test(t) && !/^[+-]?0\d/.test(t) && t.replace(/\D/g, '').length <= 15) return Number(t.replace(/,/g, ''));
  if ((m = /^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*%$/.exec(t))) {
    if (hint) hint.unit = '%';
    return Number(m[1].replace(/,/g, ''));
  }
  if ((m = MONEY.exec(t)) && /^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(m[3])) {
    if (hint && !hint.type) Object.assign(hint, { type: 'money', currency: m[2] });
    return Number(`${m[1]}${m[3].replace(/,/g, '')}`);
  }
  return s;
}

// ---- columns and expressions ---------------------------------------------------------------------------------------

/** A cell of a column. */
export function cellAt(col: DataColumn, i: number): Cell {
  if (col.nums) {
    const n = col.nums[i];
    return Number.isNaN(n) ? null : n;
  }
  return col.vals![i] ?? null;
}

const bare = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Takes the brackets, backquotes or quotes off a column's name: [Order date], `Order date`. */
const unquote = (s: string) => {
  const t = s.trim();
  return /^\[.*\]$|^`.*`$|^".*"$|^'.*'$/s.test(t) ? t.slice(1, -1).trim() : t;
};

/** A column's index by its heading (in any case), or an error that lists the headings. */
export function columnIndex(t: DataTable, name: string, where = ''): number {
  const want = unquote(name);
  let i = t.columns.findIndex((c) => c.name === want);
  if (i < 0) i = t.columns.findIndex((c) => bare(c.name) === bare(want));
  if (i < 0) {
    const names = t.columns.map((c) => c.name);
    const shown = names.slice(0, 30).join(', ') + (names.length > 30 ? ', …' : '');
    throw new RefError(where ? `No column called “${want}” in ${where}. Its columns: ${shown}.` : `No column called “${want}”. Its columns: ${shown}.`);
  }
  return i;
}

export type Agg = 'sum' | 'avg' | 'median' | 'count' | 'distinct' | 'min' | 'max' | 'first' | 'last';
const AGGS: Record<string, Agg> = { sum: 'sum', total: 'sum', avg: 'avg', average: 'avg', mean: 'avg', median: 'median', count: 'count', distinct: 'distinct', count_distinct: 'distinct', countdistinct: 'distinct', unique: 'distinct', min: 'min', lowest: 'min', max: 'max', highest: 'max', first: 'first', last: 'last' };

/** What a card shows of a column: the column itself, or a sum, count… of it; under its label. */
export interface Measure {
  /** As it was written ("sum(Revenue) as Sales"). */
  text: string;
  label: string;
  fn: Agg | null;
  /** The column (-1: count() of the rows). */
  col: number;
  /** Its label was given with "as". */
  named?: boolean;
}

const LABEL_OF: Record<Agg, (c: string) => string> = {
  sum: (c) => c,
  avg: (c) => `${c} (average)`,
  median: (c) => `${c} (median)`,
  count: (c) => `${c} (count)`,
  distinct: (c) => `${c} (different)`,
  min: (c) => `${c} (lowest)`,
  max: (c) => `${c} (highest)`,
  first: (c) => c,
  last: (c) => c,
};

/** A measure from its words: `Revenue`, `sum(Revenue)`, `count()`, `avg([Order value]) as Average order`. */
export function parseMeasure(t: DataTable, raw: unknown, where = ''): Measure {
  const written = text(raw);
  if (!written) throw new RefError('A column is missing: name it by its heading, or as sum(Heading), count()…');
  let body = written;
  let label = '';
  const as = /^(.*\S)\s+as\s+(.+)$/i.exec(written);
  if (as && !t.columns.some((c) => bare(c.name) === bare(written))) {
    body = as[1].trim();
    label = unquote(as[2]);
  }
  const call = /^([a-z_]+)\s*\((.*)\)$/is.exec(body);
  if (call && AGGS[call[1].toLowerCase()] && !t.columns.some((c) => bare(c.name) === bare(body))) {
    const fn = AGGS[call[1].toLowerCase()];
    const arg = unquote(call[2]);
    if (!arg || arg === '*') {
      if (fn !== 'count') throw new RefError(`${call[1]}() needs a column: ${call[1]}(Heading).`);
      return { text: written, label: label || 'Count', fn, col: -1, ...(label ? { named: true } : {}) };
    }
    const col = columnIndex(t, arg, where);
    return { text: written, label: label || LABEL_OF[fn](t.columns[col].name), fn, col, ...(label ? { named: true } : {}) };
  }
  if (call && !t.columns.some((c) => bare(c.name) === bare(body))) throw new RefError(`“${call[1]}” is not a sum or a count this knows: use sum, avg, median, count, distinct, min, max, first or last.`);
  const col = columnIndex(t, body, where);
  return { text: written, label: label || t.columns[col].name, fn: null, col, ...(label ? { named: true } : {}) };
}

// ---- the filter: a small language of its own -----------------------------------------------------------------------
//
//   Region = 'EU' and Revenue > 1000
//   Status in ('Open', 'Waiting') or not [Due date] is empty
//   Name contains 'kiln' and Month between '2026-01' and '2026-06'
//
// Columns by their headings (in brackets or backquotes when they have spaces), words in quotes, numbers as numbers;
// = != <> < <= > >=, in (…), contains, starts with, ends with, is empty, is not empty, between … and …, and, or, not,
// brackets. Words compare without regard to case; a number written as words compares as a number.

type Tok = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'col'; v: string } | { k: 'word'; v: string } | { k: 'op'; v: string } | { k: 'p'; v: string };

function tokens(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let s = '';
      let j = i + 1;
      for (; j < src.length; j++) {
        if (src[j] === ch) {
          if (src[j + 1] === ch) {
            s += ch;
            j++;
            continue;
          }
          break;
        }
        s += src[j];
      }
      if (j >= src.length) throw new RefError(`The filter has words in quotes that are not closed: ${src.slice(i, i + 30)}`);
      out.push({ k: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (ch === '[' || ch === '`') {
      const end = src.indexOf(ch === '[' ? ']' : '`', i + 1);
      if (end < 0) throw new RefError(`The filter has a column's name that is not closed: ${src.slice(i, i + 30)}`);
      out.push({ k: 'col', v: src.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    // A date or a month written without quotes (2026-01-31, 2026-01) is words, as it is written.
    const day = /^\d{4}-\d{2}(?:-\d{2})?(?:[ T]\d{2}:\d{2}(?::\d{2})?)?(?![\w-])/.exec(src.slice(i));
    if (day) {
      out.push({ k: 'str', v: day[0] });
      i += day[0].length;
      continue;
    }
    const num = /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?![\w])/i.exec(src.slice(i));
    if (num) {
      out.push({ k: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const op = /^(<=|>=|<>|!=|==|=|<|>)/.exec(src.slice(i));
    if (op) {
      out.push({ k: 'op', v: op[1] === '==' ? '=' : op[1] === '<>' ? '!=' : op[1] });
      i += op[1].length;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      out.push({ k: 'p', v: ch });
      i++;
      continue;
    }
    const w = /^[\p{L}_][\p{L}\p{N}_.#%-]*/u.exec(src.slice(i));
    if (w) {
      out.push({ k: 'word', v: w[0] });
      i += w[0].length;
      continue;
    }
    throw new RefError(`The filter has “${ch}” where it cannot be read: ${src.slice(Math.max(0, i - 10), i + 20)}`);
  }
  return out;
}

type Val = (i: number) => Cell;
type Cond = (i: number) => boolean;

const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'contains', 'starts', 'ends', 'with', 'is', 'empty', 'null', 'between', 'true', 'false']);

/** A cell as a number when it is one or is written as one, else null. */
function asNum(v: Cell): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUM.test(v.trim())) return Number(v.trim().replace(/,/g, ''));
  return null;
}
const asText = (v: Cell) => (v === null ? '' : String(v)).trim().toLowerCase();

/** Two cells in order: numbers as numbers, else words without regard to case; empty ones last. */
export function compareCells(a: Cell, b: Cell): number {
  const ea = a === null || a === '';
  const eb = b === null || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  const na = asNum(a);
  const nb = asNum(b);
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  const x = asText(a);
  const y = asText(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

const equal = (a: Cell, b: Cell) => {
  if (a === null || b === null || a === '' || b === '') return (a === null || a === '') && (b === null || b === '');
  const na = asNum(a);
  const nb = asNum(b);
  if (na !== null && nb !== null) return na === nb;
  return asText(a) === asText(b);
};
const truthy = (v: Cell) => !(v === null || v === false || v === 0 || (typeof v === 'string' && /^(|false|no|0)$/i.test(v.trim())));

/** The filter, read: a test of a row by its index. */
export function parseWhere(t: DataTable, src: string, where = ''): Cond {
  const toks = tokens(src);
  let p = 0;
  const peek = () => toks[p];
  const isWord = (w: string, at = p) => toks[at]?.k === 'word' && (toks[at] as { v: string }).v.toLowerCase() === w;
  const take = (w: string) => {
    if (!isWord(w)) throw new RefError(`The filter needs “${w}” after “${describe(toks[p - 1])}”.`);
    p++;
  };
  const describe = (tk?: Tok) => (!tk ? '' : tk.k === 'str' ? `'${tk.v}'` : String(tk.v));
  const column = (name: string): Val => {
    const col = t.columns[columnIndex(t, name, where)];
    return (i) => cellAt(col, i);
  };
  const operand = (): Val | Cond => {
    const tk = peek();
    if (!tk) throw new RefError('The filter ends too soon.');
    if (tk.k === 'p' && tk.v === '(') {
      p++;
      const inner = or();
      if (!(peek()?.k === 'p' && (peek() as { v: string }).v === ')')) throw new RefError('The filter has a bracket that is not closed.');
      p++;
      return inner;
    }
    p++;
    if (tk.k === 'num') return () => tk.v;
    if (tk.k === 'str') return () => tk.v;
    if (tk.k === 'col') return column(tk.v);
    if (tk.k === 'word') {
      const w = tk.v.toLowerCase();
      if (w === 'true') return () => true;
      if (w === 'false') return () => false;
      if (w === 'null') return () => null;
      if (KEYWORDS.has(w) && !t.columns.some((c) => bare(c.name) === w)) throw new RefError(`The filter has “${tk.v}” where a column or a value should be.`);
      return column(tk.v);
    }
    throw new RefError(`The filter has “${tk.v}” where a column or a value should be.`);
  };
  /** A value (an operand that is not a condition: a test is a value of true or false). */
  const value = (): Val => {
    const before = p;
    const v = operand();
    // A bracketed condition used as a value: its truth.
    return toks[before]?.k === 'p' ? (i) => (v as Cond)(i) as unknown as Cell : (v as Val);
  };
  const list = (): Val[] => {
    if (!(peek()?.k === 'p' && (peek() as { v: string }).v === '(')) throw new RefError('After “in”, the filter needs a list in brackets: in (\'A\', \'B\').');
    p++;
    const vals: Val[] = [];
    for (;;) {
      vals.push(value());
      const tk = peek();
      if (tk?.k === 'p' && tk.v === ',') {
        p++;
        continue;
      }
      if (tk?.k === 'p' && tk.v === ')') {
        p++;
        return vals;
      }
      throw new RefError('A list in the filter needs commas between its values and a closing bracket.');
    }
  };
  const compare = (): Cond => {
    const start = p;
    const a = operand();
    const grouped = toks[start]?.k === 'p';
    const tk = peek();
    const neg = isWord('not') && (isWord('in', p + 1) || isWord('contains', p + 1) || isWord('between', p + 1) || isWord('like', p + 1));
    if (neg) p++;
    const av = grouped ? (i: number) => (a as Cond)(i) as unknown as Cell : (a as Val);
    let c: Cond | null = null;
    if (tk?.k === 'op' && !neg) {
      p++;
      const b = value();
      const op = tk.v;
      c =
        op === '='
          ? (i) => equal(av(i), b(i))
          : op === '!='
            ? (i) => !equal(av(i), b(i))
            : (i) => {
                const x = av(i);
                const y = b(i);
                if (x === null || y === null || x === '' || y === '') return false;
                const r = compareCells(x, y);
                return op === '<' ? r < 0 : op === '<=' ? r <= 0 : op === '>' ? r > 0 : r >= 0;
              };
    } else if (isWord('in')) {
      p++;
      const vals = list();
      c = (i) => {
        const x = av(i);
        return vals.some((v) => equal(x, v(i)));
      };
    } else if (isWord('contains') || isWord('like')) {
      p++;
      const b = value();
      c = (i) => asText(av(i)).includes(asText(b(i)).replace(/^%|%$/g, ''));
    } else if (isWord('starts') || isWord('ends')) {
      const starts = isWord('starts');
      p++;
      take('with');
      const b = value();
      c = starts ? (i) => asText(av(i)).startsWith(asText(b(i))) : (i) => asText(av(i)).endsWith(asText(b(i)));
    } else if (isWord('is')) {
      p++;
      const not = isWord('not');
      if (not) p++;
      if (!isWord('empty') && !isWord('null')) throw new RefError('After “is”, the filter needs “empty” (or “not empty”).');
      p++;
      c = not ? (i) => !(av(i) === null || av(i) === '') : (i) => av(i) === null || av(i) === '';
    } else if (isWord('between')) {
      p++;
      const lo = value();
      take('and');
      const hi = value();
      c = (i) => {
        const x = av(i);
        if (x === null || x === '') return false;
        return compareCells(x, lo(i)) >= 0 && compareCells(x, hi(i)) <= 0;
      };
    } else if (neg) throw new RefError('The filter has “not” where it cannot be read.');
    if (!c) return grouped ? (a as Cond) : (i) => truthy((a as Val)(i));
    return neg ? (i) => !c!(i) : c;
  };
  const not = (): Cond => {
    if (isWord('not')) {
      p++;
      const inner = not();
      return (i) => !inner(i);
    }
    return compare();
  };
  const and = (): Cond => {
    const parts = [not()];
    while (isWord('and')) {
      p++;
      parts.push(not());
    }
    return parts.length === 1 ? parts[0] : (i) => parts.every((f) => f(i));
  };
  const or = (): Cond => {
    const parts = [and()];
    while (isWord('or')) {
      p++;
      parts.push(and());
    }
    return parts.length === 1 ? parts[0] : (i) => parts.some((f) => f(i));
  };
  if (!toks.length) return () => true;
  const cond = or();
  if (p < toks.length) throw new RefError(`The filter has “${describe(toks[p])}” where it cannot be read: join conditions with and or or.`);
  return cond;
}

// ---- a query: filter, group, measure, sort, limit -----------------------------------------------------------------

export interface Query {
  /** A filter, or several that must all hold. */
  where?: string | string[];
  /** Columns to group the rows by: one row for each different set of their values. */
  groupBy?: string[];
  /** What each row of the result holds. */
  measures: Measure[];
  /** Sort keys: a measure (its words or label) or a column, "-" first (or " desc" after) for the highest first. */
  sort?: string[];
  limit?: number;
  /** Grouped even when nothing says so (a ranking's names). */
  grouped?: boolean;
  /** The table's name, for messages. */
  name?: string;
}

export interface QueryResult {
  measures: Measure[];
  rows: Cell[][];
  /** Rows of the source the filter kept. */
  matched: number;
  /** Rows of the result before the limit. */
  total: number;
}

/** Sort keys from a card's `sort`: "Revenue", "-Revenue", "Revenue desc", a list of them. */
export function sortKeys(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : [];
  return list.map(text).filter(Boolean).slice(0, 4);
}

function sortKey(k: string): { body: string; desc: boolean } {
  let body = k.trim();
  let desc = false;
  if (body.startsWith('-')) {
    desc = true;
    body = body.slice(1).trim();
  } else if (body.startsWith('+')) body = body.slice(1).trim();
  const m = /^(.*\S)\s+(asc|desc|ascending|descending)$/i.exec(body);
  if (m) {
    body = m[1];
    desc = m[2].toLowerCase().startsWith('desc');
  }
  return { body, desc };
}

interface Acc {
  add(i: number): void;
  get(): Cell;
}

/** Sums without the noise of adding fractions in binary (0.1 + 0.2): twelve significant digits. */
const round = (n: number) => Number(n.toPrecision(12));

function accumulator(m: Measure, t: DataTable): Acc {
  const col = m.col >= 0 ? t.columns[m.col] : null;
  const at = (i: number) => (col ? cellAt(col, i) : null);
  switch (m.fn) {
    case 'count': {
      let n = 0;
      return { add: (i) => void (col ? at(i) !== null && n++ : n++), get: () => n };
    }
    case 'distinct': {
      const seen = new Set<string>();
      return { add: (i) => void (at(i) !== null && seen.add(asText(at(i)))), get: () => seen.size };
    }
    case 'sum':
    case 'avg': {
      let s = 0;
      let n = 0;
      return {
        add: (i) => {
          const v = asNum(at(i));
          if (v !== null) (s += v), n++;
        },
        get: () => (n ? round(m.fn === 'sum' ? s : s / n) : m.fn === 'sum' ? 0 : null),
      };
    }
    case 'median': {
      const vals: number[] = [];
      return {
        add: (i) => {
          const v = asNum(at(i));
          if (v !== null) vals.push(v);
        },
        get: () => (vals.length ? round(quantile(vals.sort((a, b) => a - b), 0.5)) : null),
      };
    }
    case 'min':
    case 'max': {
      let best: Cell = null;
      const sign = m.fn === 'min' ? 1 : -1;
      return {
        add: (i) => {
          const v = at(i);
          if (v !== null && (best === null || sign * compareCells(v, best) < 0)) best = v;
        },
        get: () => best,
      };
    }
    case 'last': {
      let v: Cell = null;
      return { add: (i) => void (at(i) !== null && (v = at(i))), get: () => v };
    }
    default: {
      // first, and a column of grouped rows that is not grouped by: its first value.
      let v: Cell = null;
      let has = false;
      return { add: (i) => void (!has && at(i) !== null && ((v = at(i)), (has = true))), get: () => v };
    }
  }
}

/** Runs a query on a table: the rows the filter keeps, grouped and measured, sorted, the first `limit`. */
export function runQuery(t: DataTable, q: Query): QueryResult {
  const tests = (Array.isArray(q.where) ? q.where : [q.where ?? '']).filter((w) => w.trim()).map((w) => parseWhere(t, w, q.name));
  const test = !tests.length ? null : tests.length === 1 ? tests[0] : (i: number) => tests.every((f) => f(i));
  const keep: number[] = [];
  for (let i = 0; i < t.rows; i++) if (!test || test(i)) keep.push(i);
  const groupCols = (q.groupBy ?? []).map((g) => columnIndex(t, g, q.name));
  const grouped = !!q.grouped || groupCols.length > 0 || q.measures.some((m) => m.fn);
  // Sort keys that are not among the measures are worked out beside them, and dropped after.
  const keys = (q.sort ?? []).map(sortKey);
  const all = [...q.measures];
  const keyAt = keys.map(({ body }) => {
    const b = bare(body);
    let i = all.findIndex((m) => bare(m.label) === b || bare(m.text) === b);
    if (i < 0) {
      const m = parseMeasure(t, body, q.name);
      i = all.findIndex((x) => x.col === m.col && x.fn === m.fn);
      if (i < 0) i = all.push(m) - 1;
    }
    return i;
  });
  let rows: Cell[][];
  if (grouped) {
    const groups = new Map<string, { accs: Acc[] }>();
    const order: { accs: Acc[] }[] = [];
    for (const i of keep) {
      let k = '';
      for (const c of groupCols) k += `${asText(cellAt(t.columns[c], i))}\u0001`;
      let g = groups.get(k);
      if (!g) {
        // A grouped-by column is the group's own value; anything else its sum, count… (or its first value).
        g = { accs: all.map((m) => accumulator(groupCols.includes(m.col) && !m.fn ? { ...m, fn: 'first' } : m, t)) };
        groups.set(k, g);
        order.push(g);
      }
      for (const a of g.accs) a.add(i);
    }
    // Nothing kept and nothing grouped by: one row, of sums of nothing (a count of 0).
    if (!order.length && !groupCols.length) order.push({ accs: all.map((m) => accumulator(m, t)) });
    rows = order.map((g) => g.accs.map((a) => a.get()));
  } else rows = keep.map((i) => all.map((m) => cellAt(t.columns[m.col], i)));
  if (keys.length) {
    const idx = rows.map((_, i) => i);
    idx.sort((a, b) => {
      for (let k = 0; k < keys.length; k++) {
        const x = rows[a][keyAt[k]];
        const y = rows[b][keyAt[k]];
        const empty = (v: Cell) => v === null || v === '';
        if (empty(x) || empty(y)) {
          if (empty(x) !== empty(y)) return empty(x) ? 1 : -1;
          continue;
        }
        const r = compareCells(x, y);
        if (r) return keys[k].desc ? -r : r;
      }
      return a - b;
    });
    rows = idx.map((i) => rows[i]);
  }
  const total = rows.length;
  const limit = Number.isFinite(q.limit) && q.limit! > 0 ? Math.floor(q.limit!) : Infinity;
  if (rows.length > limit) rows = rows.slice(0, limit);
  if (all.length > q.measures.length) rows = rows.map((r) => r.slice(0, q.measures.length));
  return { measures: q.measures, rows, matched: keep.length, total };
}

// ---- each UI's data from a reference --------------------------------------------------------------------------------

/** What a card is drawn with: its data in its UI's own shape, and how much of the source it shows. */
export interface Resolved {
  data: Record<string, unknown>;
  /** Rows of the source the filter kept. */
  matched: number;
  /** When the card shows part of what was worked out: how many of how many (rows, labels, items, points). */
  shown?: number;
  total?: number;
  /** What else the person should know (a series left out, a sample drawn). */
  notes: string[];
}

/** The fields a reference reads, which its card's data no longer needs once resolved. */
const REF_FIELDS = ['from', 'where', 'groupBy', 'group_by', 'limit'];

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter(Boolean) : text(v) ? [text(v)] : []);
const groupsOf = (d: Record<string, unknown>) => listOf(d.groupBy ?? d.group_by);
const limitOf = (v: unknown, dflt: number, max: number) => {
  const n = Number(v);
  return Math.min(max, Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt);
};
const without = (d: Record<string, unknown>, ...keys: string[]) => {
  const out = { ...d };
  for (const k of [...REF_FIELDS, ...keys]) delete out[k];
  return out;
};
/** A cell as a label: dates and numbers as they are written. */
const label = (v: Cell) => (v === null ? '' : typeof v === 'number' ? String(Number(v.toPrecision(12))) : String(v));
/** A cell as a number, or null. */
const numOf = (v: Cell) => asNum(v);

/** A table: its columns (all of the source's unless named), its rows. */
function tableFrom(d: Record<string, unknown>, t: DataTable, name: string): Resolved {
  const groupBy = groupsOf(d);
  const given = Array.isArray(d.columns) ? d.columns.filter((c) => text(c) || (isObj(c) && text(c.key ?? c.label))) : [];
  const specs: { m: Measure; o: Record<string, unknown> }[] = (given.length ? given : groupBy.length ? [...groupBy, 'count()'] : t.columns.map((c) => c.name)).map((c) => {
    const o = isObj(c) ? c : {};
    const m = parseMeasure(t, isObj(c) ? (c.key ?? c.label) : c, name);
    if (isObj(c) && text(c.label) && !m.named) m.label = text(c.label);
    return { m, o };
  });
  const r = runQuery(t, { where: text(d.where), groupBy, measures: specs.map((s) => s.m), sort: sortKeys(d.sort), limit: limitOf(d.limit, REF_LIMITS.tableRows, REF_LIMITS.tableRows), name });
  const keys = cleanHeadings(specs.map((s) => s.m.label));
  const columns = specs.map((s, i) => {
    const src = s.m.col >= 0 ? t.columns[s.m.col] : null;
    const counted = s.m.fn === 'count' || s.m.fn === 'distinct';
    const hint = counted ? undefined : src?.hint;
    const values = r.rows.map((row) => row[i]).filter((v) => v !== null && v !== '');
    const numeric = values.length > 0 && values.every((v) => typeof v === 'number');
    const dates = values.length > 0 && values.every((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(v));
    const type = text(s.o.type) || (hint?.type === 'money' && numeric ? 'money' : hint?.type === 'percent' && numeric ? 'percent' : hint?.type === 'date' || dates ? 'date' : numeric ? 'number' : '');
    const unit = text(s.o.unit) || (type === 'number' && hint?.unit ? hint.unit : '');
    const currency = text(s.o.currency) || (type === 'money' ? (hint?.currency ?? '') : '');
    return { key: keys[i], label: s.m.label, ...(type ? { type } : {}), ...(unit ? { unit } : {}), ...(currency ? { currency } : {}) };
  });
  const rows = r.rows.map((row) => Object.fromEntries(columns.map((c, i) => [c.key, row[i]])));
  // Totals are named as the columns are: by heading or by what was asked.
  const totals = listOf(d.totals)
    .map((x) => {
      const i = specs.findIndex((s) => bare(s.m.label) === bare(x) || bare(s.m.text) === bare(x));
      return i >= 0 ? columns[i].key : '';
    })
    .filter(Boolean);
  const data = without(d, 'columns', 'rows', 'sort', 'totals');
  return { data: { ...data, columns, rows, ...(totals.length ? { totals } : {}) }, matched: r.matched, ...(r.total > r.rows.length ? { shown: r.rows.length, total: r.total } : {}), notes: [] };
}

/** A chart: its labels along x and a series for each y (or for each value of groupBy). */
function chartFrom(d: Record<string, unknown>, t: DataTable, name: string): Resolved {
  const kind = text(d.kind).toLowerCase() || 'line';
  const notes: string[] = [];
  const groupBy = groupsOf(d)[0];
  const xName = text(d.x) || t.columns[0]?.name;
  if (!xName) throw new RefError('The source is empty: it has no columns.');
  const xm = parseMeasure(t, xName, name);
  if (xm.fn) throw new RefError(`x is the column of labels along the chart (${xName}): give the sums and counts in y.`);
  const xCol = t.columns[xm.col].name;
  let ys = listOf(d.y);
  if (!ys.length) {
    // Every column of numbers but x.
    ys = t.columns.filter((c, i) => i !== xm.col && !!c.nums).map((c) => c.name);
    if (!ys.length) throw new RefError(`Say which column to draw with y: there is no column of numbers beside ${t.columns[xm.col].name}.`);
  }
  if (ys.length > REF_LIMITS.series) {
    notes.push(`${ys.length - REF_LIMITS.series} of the columns asked for are left out: a chart draws ${REF_LIMITS.series} at most.`);
    ys = ys.slice(0, REF_LIMITS.series);
  }
  const yms = ys.map((y) => parseMeasure(t, y, name));
  const base = without(d, 'x', 'y', 'series', 'sort', 'label', 'size');
  const where = text(d.where);
  const sort = sortKeys(d.sort);
  if (kind === 'scatter' || kind === 'bubble') {
    const lm = text(d.label) ? parseMeasure(t, d.label, name) : null;
    const sm = text(d.size) ? parseMeasure(t, d.size, name) : null;
    const gm = groupBy ? parseMeasure(t, groupBy, name) : null;
    const measures = [xm, yms[0], ...(lm ? [lm] : []), ...(sm ? [sm] : []), ...(gm ? [gm] : [])];
    const r = runQuery(t, { where, measures, sort, limit: d.limit !== undefined ? limitOf(d.limit, REF_LIMITS.points, REF_LIMITS.points * REF_LIMITS.series) : undefined, name });
    const bySeries = new Map<string, Record<string, unknown>[]>();
    for (const row of r.rows) {
      const px = numOf(row[0]);
      const py = numOf(row[1]);
      if (px === null || py === null) continue;
      const k = gm ? label(row[measures.length - 1]) || '—' : yms[0].label;
      let list = bySeries.get(k);
      if (!list) bySeries.set(k, (list = []));
      list.push({ x: px, y: py, ...(lm ? { label: label(row[2]) } : {}), ...(sm ? { size: numOf(row[lm ? 3 : 2]) } : {}) });
    }
    let series = [...bySeries.entries()].map(([n, points]) => ({ name: n, values: points }));
    if (series.length > REF_LIMITS.series) {
      notes.push(`${series.length - REF_LIMITS.series} groups are left out: a chart draws ${REF_LIMITS.series} at most.`);
      series = series.sort((a, b) => b.values.length - a.values.length).slice(0, REF_LIMITS.series);
    }
    let shown = 0;
    let total = 0;
    for (const s of series) {
      total += s.values.length;
      if (s.values.length > REF_LIMITS.points) {
        // An even sample, in order.
        const step = s.values.length / REF_LIMITS.points;
        s.values = Array.from({ length: REF_LIMITS.points }, (_, i) => s.values[Math.floor(i * step)]);
      }
      shown += s.values.length;
    }
    if (shown < total) notes.push(`An even sample of ${fmt(shown)} of the ${fmt(total)} points is drawn.`);
    return {
      data: { ...base, kind, series, ...(base.x_label === undefined ? { x_label: t.columns[xm.col].name } : {}), ...(base.y_label === undefined ? { y_label: yms[0].label } : {}) },
      matched: r.matched,
      ...(shown < total ? { shown, total } : {}),
      notes,
    };
  }
  const grouped = !!groupBy || yms.some((m) => m.fn) || !!d.groupBy;
  // When rows are grouped, a column drawn as it is adds up for each label.
  const summed = (m: Measure): Measure => (grouped && !m.fn ? { ...m, fn: 'sum' } : m);
  if (!groupBy) {
    const r = runQuery(t, { where, groupBy: grouped ? [xCol] : undefined, measures: [xm, ...yms.map(summed)], sort, limit: limitOf(d.limit, REF_LIMITS.chartLabels, REF_LIMITS.chartLabels), name });
    const one = kind === 'pie' || kind === 'donut';
    if (one && yms.length > 1) notes.push(`A ${kind} chart draws one series: ${yms[0].label}.`);
    return {
      data: { ...base, kind, x: r.rows.map((row) => label(row[0])), series: (one ? yms.slice(0, 1) : yms).map((m, i) => ({ name: m.label, values: r.rows.map((row) => numOf(row[i + 1])) })) },
      matched: r.matched,
      ...(r.total > r.rows.length ? { shown: r.rows.length, total: r.total } : {}),
      notes,
    };
  }
  // A series for each value of groupBy: the rows grouped by x and by it, then laid out label by label.
  if (yms.length > 1) notes.push(`With groupBy, a chart draws one column for each group: ${yms[0].label}.`);
  const ym = summed(yms[0]);
  const gm = parseMeasure(t, groupBy, name);
  const r = runQuery(t, { where, groupBy: [xCol, t.columns[gm.col].name], measures: [xm, gm, ym], name });
  const labels: string[] = [];
  const at = new Map<string, number>();
  const per = new Map<string, Map<string, number | null>>();
  const totals = new Map<string, number>();
  for (const row of r.rows) {
    const x = label(row[0]);
    const g = label(row[1]) || '—';
    if (!at.has(x)) at.set(x, labels.push(x) - 1);
    let m = per.get(g);
    if (!m) per.set(g, (m = new Map()));
    const v = numOf(row[2]);
    m.set(x, v);
    totals.set(g, (totals.get(g) ?? 0) + Math.abs(v ?? 0));
  }
  // The labels in the order sort asks (by x, or by the total of what is drawn), else as they come.
  let xs = labels;
  if (sort.length) {
    const { body, desc } = sortKey(sort[0]);
    const byX = bare(body) === bare(xm.label) || bare(body) === bare(xCol) || bare(body) === bare(xName);
    const sumAt = (x: string) => [...per.values()].reduce((s, m) => s + (m.get(x) ?? 0), 0);
    xs = [...labels].sort((a, b) => {
      const c = byX ? compareCells(a, b) : sumAt(a) - sumAt(b);
      return desc ? -c : c;
    });
  }
  const limit = limitOf(d.limit, REF_LIMITS.chartLabels, REF_LIMITS.chartLabels);
  const total = xs.length;
  xs = xs.slice(0, limit);
  let names = [...per.keys()];
  if (names.length > REF_LIMITS.series) {
    notes.push(`${names.length - REF_LIMITS.series} of the ${names.length} groups are left out: the chart draws the ${REF_LIMITS.series} largest.`);
    names = names
      .map((n, i) => ({ n, i }))
      .sort((a, b) => (totals.get(b.n) ?? 0) - (totals.get(a.n) ?? 0))
      .slice(0, REF_LIMITS.series)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.n);
  }
  return {
    data: { ...base, kind, x: xs, series: names.map((n) => ({ name: n, values: xs.map((x) => per.get(n)?.get(x) ?? null) })) },
    matched: r.matched,
    ...(total > xs.length ? { shown: xs.length, total } : {}),
    notes,
  };
}

/** Key figures: each tile's value a sum, count… of the rows its filter keeps; with `by`, its latest group's, a trend and a change. */
function statsFrom(d: Record<string, unknown>, t: DataTable, name: string): Resolved {
  const list = (Array.isArray(d.stats) ? d.stats : Array.isArray(d.items) ? d.items : []).filter(isObj).slice(0, REF_LIMITS.stats);
  if (!list.length) throw new RefError('Give stats: a list of tiles, each with a label and its value as sum(Heading), count()…');
  const where = text(d.where);
  let matched = 0;
  const stats = list.map((s) => {
    const raw = s.value;
    if (typeof raw !== 'string' || !raw.trim()) return s;
    const m = parseMeasure(t, raw, name);
    const both = [where, text(s.where)];
    const by = text(s.by);
    const out: Record<string, unknown> = { ...s };
    delete out.where;
    delete out.by;
    if (!by) {
      // A column as it is: its last value (a balance, the latest reading).
      const r = runQuery(t, { where: both, measures: [m.fn ? m : { ...m, fn: 'last' }], grouped: true, name });
      matched = Math.max(matched, r.matched);
      out.value = r.rows[0]?.[0] ?? null;
      return out;
    }
    const bm = parseMeasure(t, by, name);
    const r = runQuery(t, { where: both, groupBy: [by], measures: [bm, m.fn ? m : { ...m, fn: 'sum' }], name });
    matched = Math.max(matched, r.matched);
    let rows = r.rows;
    // Dates and numbers in their order; anything else as it comes (months by name already are).
    if (rows.every((row) => row[0] === null || typeof row[0] === 'number' || /^\d{4}-\d{2}/.test(String(row[0])))) rows = [...rows].sort((a, b) => compareCells(a[0], b[0]));
    const values = rows.map((row) => numOf(row[1]));
    const last = values[values.length - 1] ?? null;
    const prev = values.length > 1 ? values[values.length - 2] : null;
    out.value = last;
    if (values.length > 1) out.trend = values.slice(-REF_LIMITS.trend);
    if ((s.change === undefined || s.change === 'pct' || s.change === 'diff') && last !== null && prev !== null) {
      if (s.change === 'diff') {
        out.change = Number((last - prev).toPrecision(12));
        if (s.change_unit === undefined && text(s.unit)) out.change_unit = text(s.unit);
      } else if (prev !== 0) {
        out.change = Math.round(((last - prev) / Math.abs(prev)) * 1000) / 10;
        if (s.change_unit === undefined) out.change_unit = '%';
      } else delete out.change;
    } else if (s.change === 'pct' || s.change === 'diff') delete out.change;
    if (!text(s.note) && rows.length) out.note = label(rows[rows.length - 1][0]);
    return out;
  });
  return { data: { ...without(d, 'stats', 'items'), stats }, matched, notes: [] };
}

/** A ranking: an item for each row (or each name, when its value is a sum, count…), highest first. */
function rankingFrom(d: Record<string, unknown>, t: DataTable, name: string): Resolved {
  const f = isObj(d.items) ? d.items : d;
  const nameCol = text(f.name) || t.columns[0]?.name;
  if (!nameCol) throw new RefError('The source is empty: it has no columns.');
  const valueCol = text(f.value);
  const fields = (['detail', 'image', 'tag', 'change'] as const).filter((k) => text(f[k]));
  const nm = parseMeasure(t, nameCol, name);
  const vm = valueCol ? parseMeasure(t, valueCol, name) : null;
  const grouped = !!vm?.fn || groupsOf(d).length > 0;
  const measures = [nm, ...(vm ? [vm] : []), ...fields.map((k) => parseMeasure(t, f[k], name))];
  const sort = sortKeys(d.sort);
  const r = runQuery(t, { where: text(d.where), groupBy: grouped ? [nameCol] : undefined, measures, sort: sort.length ? sort : vm ? [`-${vm.text}`] : undefined, limit: limitOf(d.limit, 10, REF_LIMITS.ranking), name });
  const items = r.rows.map((row) => {
    const it: Record<string, unknown> = { name: label(row[0]) };
    if (vm) it.value = numOf(row[1]);
    fields.forEach((k, i) => {
      const v = row[(vm ? 2 : 1) + i];
      if (v === null || v === '') return;
      it[k] = k === 'change' ? numOf(v) : label(v);
    });
    return it;
  });
  const data = without(d, 'items', 'name', 'value', 'detail', 'image', 'tag', 'change', 'sort');
  return { data: { ...data, ...(vm && data.metric === undefined ? { metric: vm.label } : {}), items }, matched: r.matched, ...(r.total > items.length ? { shown: items.length, total: r.total } : {}), notes: [] };
}

/** Values on a map: a point for each row (or each name, when its value is a sum, count…), at its latitude and longitude. */
function mapFrom(d: Record<string, unknown>, t: DataTable, name: string): Resolved {
  const f = isObj(d.points) ? d.points : d;
  const need = (k: string, guess: RegExp) => {
    const given = text(f[k]);
    if (given) return given;
    const found = t.columns.find((c) => guess.test(c.name));
    if (!found) throw new RefError(`Say which column holds each point’s ${k}: points: { ${k}: "Heading" }.`);
    return found.name;
  };
  const nameCol = text(f.name) || t.columns[0]?.name;
  const lat = need('lat', /^(lat|latitude)$/i);
  const lng = need('lng', /^(lng|lon|long|longitude)$/i);
  const valueCol = need('value', /^(value|count|amount|total)$/i);
  const vm = parseMeasure(t, valueCol, name);
  const grouped = !!vm.fn;
  const noteCol = text(f.note);
  const firstOf = (c: string) => parseMeasure(t, c, name);
  const measures = [parseMeasure(t, nameCol, name), firstOf(lat), firstOf(lng), vm, ...(noteCol ? [firstOf(noteCol)] : [])];
  const sort = sortKeys(d.sort);
  const r = runQuery(t, { where: text(d.where), groupBy: grouped ? [nameCol] : undefined, measures, sort: sort.length ? sort : [`-${vm.text}`], limit: limitOf(d.limit, 500, REF_LIMITS.mapPoints), name });
  const notes: string[] = [];
  const points = r.rows
    .map((row) => ({ name: label(row[0]), lat: numOf(row[1]), lng: numOf(row[2]), value: numOf(row[3]), ...(noteCol && row[4] !== null ? { note: label(row[4]) } : {}) }))
    .filter((p) => p.lat !== null && p.lng !== null && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
  if (points.length < r.rows.length) notes.push(`${r.rows.length - points.length} rows without a place (no latitude and longitude) are left out.`);
  const data = without(d, 'points', 'sort');
  return { data: { ...data, ...(data.unit === undefined && vm.fn === 'count' ? { unit: '' } : {}), points }, matched: r.matched, ...(r.total > r.rows.length ? { shown: r.rows.length, total: r.total } : {}), notes };
}

/** An even sample of sorted values: every n-th, the lowest and highest kept, so its quartiles are the whole's. */
function sample(sorted: number[], n: number): number[] {
  if (sorted.length <= n) return sorted;
  return Array.from({ length: n }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (n - 1))]);
}

/** A distribution: the column's numbers for a histogram, and with groupBy each group's for box plots. */
function distributionFrom(d: Record<string, unknown>, t: DataTable, name: string): Resolved {
  const col = text(d.values) || text(d.value) || text(d.column) || t.columns.find((c) => c.nums)?.name;
  if (!col) throw new RefError(`Say which column of numbers to show: values: "Heading".`);
  const m = parseMeasure(t, col, name);
  if (m.fn) throw new RefError(`A distribution shows a column's values as they are: values: "${t.columns[m.col].name}", without ${m.fn}().`);
  const groupBy = groupsOf(d)[0];
  const gm = groupBy ? parseMeasure(t, groupBy, name) : null;
  const r = runQuery(t, { where: text(d.where), measures: gm ? [m, gm] : [m], name });
  const notes: string[] = [];
  const all: number[] = [];
  const groups = new Map<string, number[]>();
  for (const row of r.rows) {
    const v = numOf(row[0]);
    if (v === null) continue;
    all.push(v);
    if (gm) {
      const k = label(row[1]) || '—';
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(v);
    }
  }
  const data: Record<string, unknown> = without(d, 'values', 'value', 'column', 'bins', 'groups');
  if (data.unit === undefined && t.columns[m.col].hint?.unit) data.unit = t.columns[m.col].hint!.unit;
  // A histogram of all of them (exact up to REF_LIMITS.values; past them counted in bins here, as the card would).
  if (all.length <= REF_LIMITS.values) data.values = all;
  else {
    const width = Number(d.bin_width);
    data.bins = binValues(all, Number.isFinite(width) && width > 0 ? width : null);
    notes.push(`${fmt(all.length)} values, counted in bins: the summary's figures are estimates.`);
  }
  if (gm) {
    let list = [...groups.entries()];
    if (list.length > REF_LIMITS.series) {
      notes.push(`${list.length - REF_LIMITS.series} of the ${list.length} groups are left out: the ${REF_LIMITS.series} largest are shown.`);
      list = list.sort((a, b) => b[1].length - a[1].length).slice(0, REF_LIMITS.series);
    }
    const room = Math.floor(REF_LIMITS.values / Math.max(1, list.length));
    let sampled = false;
    data.groups = list.map(([n, vals]) => {
      if (vals.length > room) sampled = true;
      return { name: n, values: vals.length > room ? sample([...vals].sort((a, b) => a - b), room) : vals };
    });
    if (sampled) notes.push('The box plots are drawn from an even sample of each large group (its quartiles kept).');
  }
  return { data, matched: r.matched, notes };
}

const RESOLVERS: Record<string, (d: Record<string, unknown>, t: DataTable, name: string) => Resolved> = {
  table: tableFrom,
  chart: chartFrom,
  stats: statsFrom,
  ranking: rankingFrom,
  'map-values': mapFrom,
  distribution: distributionFrom,
};

/**
 * A card's data with its reference worked out on a table (the rows its source holds): in its UI's own shape, the
 * reference's fields gone. `name` names the source in messages ("Shop numbers · Sales"). Throws a RefError a person can
 * act on: a column that is not there, a filter that cannot be read, a UI that takes no reference.
 */
export function resolveRef(ui: string, data: Record<string, unknown>, t: DataTable, name = ''): Resolved {
  const f = RESOLVERS[ui];
  if (!f) throw new RefError(`The ${ui} card cannot read from a spreadsheet or a file: those that can are ${[...REF_UIS].join(', ')}.`);
  if (!t.columns.length) throw new RefError('The source is empty: it has no columns.');
  const out = f(data, t, name);
  if (t.cut) out.notes.unshift(`Only the first ${fmt(REF_LIMITS.rows)} rows of the source are read.`);
  return out;
}

/**
 * What is wrong with a reference before it is read, by its form alone (without the source): no source, no fields a UI
 * needs, a filter or a sort that cannot be read. [] when it looks right. The tests check every spec's example with it.
 */
export function refProblems(ui: string, data: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (!REF_UIS.has(ui)) return [`${ui} takes no reference`];
  const src = refSource(data.from);
  if (!src) out.push('from names no spreadsheet or file: { "sheet": "Name", "range": "Tab!A1:D400" } or { "file": "data/sales.csv" }');
  // Columns are only known once read: here any name is one, so the filter and the measures are read for their form.
  const names = new Set<string>();
  const add = (v: unknown) => {
    const s = text(v);
    if (!s) return;
    const body = s.replace(/\s+as\s+.+$/i, '');
    const call = /^[a-z_]+\s*\((.*)\)$/is.exec(body);
    const inner = unquote(call ? call[1] : body);
    if (inner && inner !== '*') names.add(inner);
  };
  const fields: unknown[] = [];
  if (ui === 'table') for (const c of Array.isArray(data.columns) ? data.columns : []) fields.push(isObj(c) ? (c.key ?? c.label) : c);
  if (ui === 'chart') fields.push(data.x, ...listOf(data.y), data.label, data.size);
  if (ui === 'stats') {
    const list = Array.isArray(data.stats) ? data.stats.filter(isObj) : [];
    if (!list.length) out.push('stats: a list of tiles, each { label, value: "sum(Heading)" }');
    for (const s of list) fields.push(s.value, s.by);
  }
  if (ui === 'ranking') {
    const f = isObj(data.items) ? data.items : data;
    if (!text(f.name)) out.push('items: { name: "Heading", value: "sum(Heading)" }: the column of names');
    fields.push(f.name, f.value, f.detail, f.image, f.tag, f.change);
  }
  if (ui === 'map-values') {
    const f = isObj(data.points) ? data.points : {};
    if (!text(f.name)) out.push('points: { name, lat, lng, value }: the columns of names, latitudes, longitudes and values');
    fields.push(f.name, f.lat, f.lng, f.value, f.note);
  }
  if (ui === 'distribution') {
    if (!text(data.values)) out.push('values: "Heading": the column of numbers');
    fields.push(data.values);
  }
  fields.push(...groupsOf(data));
  for (const k of sortKeys(data.sort)) fields.push(sortKey(k).body);
  for (const f of fields) {
    if (f === undefined || f === null || f === '') continue;
    if (typeof f !== 'string') {
      out.push(`${JSON.stringify(f)}: name a column by its heading`);
      continue;
    }
    const call = /^\s*([a-z_]+)\s*\(/i.exec(f);
    if (call && !AGGS[call[1].toLowerCase()]) out.push(`${f}: ${call[1]}() is not a sum or a count this knows`);
    add(f);
  }
  // The filter, on a table that has whatever columns it names.
  const where = [text(data.where), ...(ui === 'stats' && Array.isArray(data.stats) ? data.stats.filter(isObj).map((s) => text(s.where)) : [])].filter(Boolean);
  for (const w of where) {
    try {
      for (const tk of tokens(w)) if (tk.k === 'col' || (tk.k === 'word' && !KEYWORDS.has(tk.v.toLowerCase()))) names.add(tk.v);
      const cols = [...names];
      parseWhere(tableOf([cols, cols.map(() => null)]), w);
    } catch (e) {
      out.push(`where: ${(e as Error).message}`);
    }
  }
  return out;
}
