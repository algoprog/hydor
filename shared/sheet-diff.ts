// Two versions of a workbook compared, as the spreadsheet editor's Compare shows them (what changed since a version,
// what an agent's turn changed): the tabs added, removed or renamed; on each tab kept, the rows and columns added,
// removed or moved, and the cells whose value, formula, number format, look or note changed, each with what it was and
// what it is, as typed and as shown; the formulas whose results changed with them; and the tab's other parts that
// changed (charts, the filter, merged cells…). putBack undoes one of those changes in the newer version.
//
// How the versions are lined up. Tabs: by their id, then their name, then what they hold (a tab renamed). Columns: by
// their header (the first row, when both versions start with a row of names), else by what they hold. Rows: by a key
// column when the table has one (the leftmost column, in both versions, whose values are filled in, never repeat and
// are words or whole numbers: an id, a name, a date), else by what each row holds. Rows the same in both versions
// anchor the rest (patience diff); between two anchors the rows left are paired by how alike they are, in order, and
// by place when as many went as came. So a row put in marks only itself, not every row under it. Formulas are compared
// with their references followed through the rows and columns put in or taken out (a total "=SUM(B2:B9)" that became
// "=SUM(B2:B10)" as a row went in is unchanged), and a cell put back gets its formula written for where it is now.
// Nothing here needs Node or a browser.
import {
  adjustForDelete,
  adjustForInsert,
  colIndex,
  computeBook,
  formatValue,
  formulaRefs,
  inputText,
  keyOf,
  newId,
  pack,
  quoteSheet,
  refName,
  refText,
  removeSheet,
  renameSheet,
  SHEET_LIMITS,
  uniqueSheetName,
  unpackC,
  unpackR,
  type Calc,
  type Cell,
  type CellStyle,
  type RefPart,
  type RefTok,
  type Sheet,
  type Workbook,
} from './sheets.ts';

/** What changed in a cell: what it holds (value, formula), or only how it shows (number format, look) or its note or link. */
export type CellKind = 'value' | 'formula' | 'format' | 'style' | 'note';

/** A cell as one version has it: as typed (a formula with its "="), and as it shows. */
export interface CellSide {
  input: string;
  shown: string;
}

export interface CellChange {
  kind: CellKind;
  /** Where it is in the newer version… */
  r: number;
  c: number;
  /** …and where it was in the older one. */
  br: number;
  bc: number;
  before: CellSide;
  after: CellSide;
  /** What it holds changed, and its look too. */
  look?: boolean;
}

/** A formula the same in both versions whose result changed (what it uses changed). */
export interface ResultChange {
  r: number;
  c: number;
  br: number;
  bc: number;
  formula: string;
  before: string;
  after: string;
}

/** How the rows (or columns) of the two versions line up. */
export interface Lines {
  /** In the order they show: a line of the newer version (a), of the older one (b), or of both; -1 where it has none. */
  order: { a: number; b: number }[];
  /** Each line of the newer version: its line in the older one, or -1 (added). */
  a2b: Int32Array;
  /** Each line of the older version: its line in the newer one, or -1 (removed). */
  b2a: Int32Array;
  added: number[];
  removed: number[];
  /** Lines in both that changed places (a sort): their place in the newer version. */
  moved: number[];
  /** Lines beyond what the older version holds move by this much (rows put in above them). */
  delta: number;
}

/** Other parts of a tab that changed, by what they are. */
export type OtherPart = 'charts' | 'merges' | 'filter' | 'conditional' | 'validation' | 'freeze' | 'protect' | 'groups' | 'tabColor' | 'hidden' | 'board' | 'pivot' | 'print';

/** How a tab's rows were lined up: by a key column (its letters and header in the newer version), or by what rows hold. */
export type RowRule = { by: 'key'; col: number; header?: string } | { by: 'content' };

export interface TabDiff {
  /** Its name in the newer version (the older one's when it was removed)… */
  name: string;
  /** …and the name it had, when it was renamed. */
  was?: string;
  status: 'kept' | 'added' | 'removed';
  /** Its place among the sheets of the newer and the older version (-1: not in it). */
  ai: number;
  bi: number;
  /** Its id in the newer version (the older one's when removed). */
  id: string;
  rows: Lines;
  cols: Lines;
  cells: CellChange[];
  results: ResultChange[];
  rule: RowRule;
  /** Both versions start with a row of names. */
  header: boolean;
  other: OtherPart[];
  /** Anything about it changed. */
  changed: boolean;
}

export interface BookDiff {
  /** The tabs in the order they show: the newer version's, with the ones removed where they were. */
  tabs: TabDiff[];
  /** The named ranges changed. */
  names: boolean;
  totals: {
    cells: number;
    /** Tabs with cells changed. */
    cellTabs: number;
    /** Tabs with anything changed. */
    tabs: number;
    rowsAdded: number;
    rowsRemoved: number;
    rowsMoved: number;
    colsAdded: number;
    colsRemoved: number;
    tabsAdded: number;
    tabsRemoved: number;
    tabsRenamed: number;
    results: number;
  };
  /** Nothing changed. */
  same: boolean;
}

// ---- the grid of a sheet ---------------------------------------------------------------------------------------------

interface Grid {
  sheet: Sheet;
  /** Cells by row, each row's by column. */
  rows: Map<number, Map<number, Cell>>;
  /** How many rows and columns its cells reach. */
  nr: number;
  nc: number;
}

function gridOf(sheet: Sheet): Grid {
  const rows = new Map<number, Map<number, Cell>>();
  let nr = 0;
  let nc = 0;
  for (const name in sheet.cells) {
    const k = keyOf(name);
    if (k < 0) continue;
    const r = unpackR(k);
    const c = unpackC(k);
    let row = rows.get(r);
    if (!row) rows.set(r, (row = new Map()));
    row.set(c, sheet.cells[name]);
    nr = Math.max(nr, r + 1);
    nc = Math.max(nc, c + 1);
  }
  return { sheet, rows, nr, nc };
}

const cellAt = (g: Grid, r: number, c: number) => g.rows.get(r)?.get(c);
const filled = (cell: Cell | undefined) => !!cell && (cell.f !== undefined || (cell.v !== undefined && cell.v !== ''));

/** A reference as it reads from the cell it is in: rows and columns counted from there, the fixed ($) ones as they are. */
function relRef(ref: RefTok, r: number, c: number): string {
  const part = (p: RefPart) => `${p.r === undefined ? '' : p.ar ? `R${p.r}` : `R[${p.r - r}]`}${p.c === undefined ? '' : p.ac ? `C${p.c}` : `C[${p.c - c}]`}`;
  return `${ref.sheet ? `${ref.sheet.toLowerCase()}!` : ''}${part(ref.a)}${ref.b ? `:${part(ref.b)}` : ''}`;
}

/** What a cell holds, said the same wherever it is (formulas in relative form): what lines rows and columns up. */
function cellSig(cell: Cell | undefined, r: number, c: number): string {
  if (!cell) return '';
  if (cell.f !== undefined) {
    let out = '';
    let last = 0;
    for (const x of formulaRefs(cell.f)) {
      out += cell.f.slice(last, x.s) + relRef(x.ref, r, c);
      last = x.e;
    }
    return `=${(out + cell.f.slice(last)).replace(/\s+/g, '').toUpperCase()}`;
  }
  const v = cell.v;
  if (v === undefined || v === '') return '';
  return typeof v === 'number' ? `n${v}` : typeof v === 'boolean' ? `b${v}` : `s${v.trim()}`;
}

// ---- lining up rows or columns -------------------------------------------------------------------------------------------

/** How alike two lines are, from 0 to 1. */
type Sim = (b: number, a: number) => number;

/** Two lines go together between anchors when at least this alike. */
const ALIKE = 0.5;
/** The largest stretch between anchors paired by how alike its lines are (its lines before × after); larger ones by place. */
const DP_CAP = 40_000;

/** The longest run of pairs rising in both (pairs sorted by `a`), by patience sorting. */
function rising(pairs: [number, number][]): [number, number][] {
  const tops: number[] = [];
  const back = new Int32Array(pairs.length).fill(-1);
  for (let i = 0; i < pairs.length; i++) {
    const b = pairs[i][0];
    let lo = 0;
    let hi = tops.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tops[mid]][0] < b) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) back[i] = tops[lo - 1];
    tops[lo] = i;
  }
  const out: [number, number][] = [];
  for (let i = tops.length ? tops[tops.length - 1] : -1; i >= 0; i = back[i]) out.push(pairs[i]);
  return out.reverse();
}

/** The lines between two anchors paired: by how alike they are, in order (by place when as many went as came). */
function pairGap(b0: number, b1: number, a0: number, a1: number, sim: Sim, out: [number, number][]) {
  const m = b1 - b0;
  const n = a1 - a0;
  if (!m || !n) return;
  if (m * n > DP_CAP) {
    for (let i = 0; i < Math.min(m, n); i++) out.push([b0 + i, a0 + i]);
    return;
  }
  const even = m === n;
  const w = new Float64Array(m * n);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      const s = sim(b0 + i, a0 + j);
      // A line changed in place pairs with the one in its place, however much changed; others only when alike.
      w[i * n + j] = s >= ALIKE ? s : even && i === j ? 0.01 : -1;
    }
  const dp = new Float64Array((m + 1) * (n + 1));
  const at = (i: number, j: number) => i * (n + 1) + j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      let best = Math.max(dp[at(i - 1, j)], dp[at(i, j - 1)]);
      const x = w[(i - 1) * n + (j - 1)];
      if (x >= 0) best = Math.max(best, dp[at(i - 1, j - 1)] + x);
      dp[at(i, j)] = best;
    }
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    const x = w[(i - 1) * n + (j - 1)];
    if (x >= 0 && dp[at(i, j)] === dp[at(i - 1, j - 1)] + x) {
      out.push([b0 + i - 1, a0 + j - 1]);
      i--;
      j--;
    } else if (dp[at(i, j)] === dp[at(i - 1, j)]) i--;
    else j--;
  }
}

/**
 * Two lists of lines lined up: those the same in both, from the ends in and then the ones found once in each (patience
 * diff), anchor; what is left between anchors is paired by how alike it is. The pairs, in order.
 */
function alignLines(sb: string[], sa: string[], sim: Sim): [number, number][] {
  const out: [number, number][] = [];
  const work: [number, number, number, number][] = [[0, sb.length, 0, sa.length]];
  while (work.length) {
    let [b0, b1, a0, a1] = work.pop()!;
    while (b0 < b1 && a0 < a1 && sb[b0] === sa[a0]) out.push([b0++, a0++]);
    while (b1 > b0 && a1 > a0 && sb[b1 - 1] === sa[a1 - 1]) out.push([--b1, --a1]);
    if (b0 >= b1 || a0 >= a1) continue;
    const inB = new Map<string, number>();
    for (let i = b0; i < b1; i++) inB.set(sb[i], inB.has(sb[i]) ? -1 : i);
    const inA = new Map<string, number>();
    for (let j = a0; j < a1; j++) inA.set(sa[j], inA.has(sa[j]) ? -1 : j);
    const once: [number, number][] = [];
    for (let j = a0; j < a1; j++) {
      const s = sa[j];
      if (s === '' || inA.get(s) !== j) continue;
      const i = inB.get(s);
      if (i !== undefined && i >= 0) once.push([i, j]);
    }
    const anchors = rising(once);
    if (!anchors.length) {
      pairGap(b0, b1, a0, a1, sim, out);
      continue;
    }
    let pb = b0;
    let pa = a0;
    for (const [i, j] of anchors) {
      out.push([i, j]);
      if (i > pb || j > pa) work.push([pb, i, pa, j]);
      pb = i + 1;
      pa = j + 1;
    }
    if (pb < b1 || pa < a1) work.push([pb, b1, pa, a1]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/** Lines lined up, the ones not paired in order but the same in both paired as moved, and the order they show in. */
function linesOf(nb: number, na: number, sb: string[], sa: string[], sim: Sim, moves: boolean): Lines {
  const pairs = alignLines(sb, sa, sim);
  const b2a = new Int32Array(nb).fill(-1);
  const a2b = new Int32Array(na).fill(-1);
  for (const [b, a] of pairs) {
    b2a[b] = a;
    a2b[a] = b;
  }
  const moved: number[] = [];
  if (moves) {
    // Left over on both sides and the same (and found once on each): a line that changed places.
    const left = new Map<string, number>();
    for (let b = 0; b < nb; b++) if (b2a[b] < 0 && sb[b] !== '') left.set(sb[b], left.has(sb[b]) ? -1 : b);
    const seen = new Map<string, number>();
    for (let a = 0; a < na; a++) if (a2b[a] < 0 && sa[a] !== '') seen.set(sa[a], seen.has(sa[a]) ? -1 : a);
    for (const [s, a] of seen) {
      const b = left.get(s);
      if (a < 0 || b === undefined || b < 0) continue;
      b2a[b] = a;
      a2b[a] = b;
      moved.push(a);
    }
    moved.sort((x, y) => x - y);
  }
  const order: { a: number; b: number }[] = [];
  let pb = 0;
  let pa = 0;
  for (const [b, a] of [...pairs, [nb, na] as [number, number]]) {
    for (let x = pb; x < b; x++) if (b2a[x] < 0) order.push({ a: -1, b: x });
    for (let y = pa; y < a; y++) order.push({ a: y, b: a2b[y] });
    if (b < nb) order.push({ a, b });
    pb = b + 1;
    pa = a + 1;
  }
  const last = pairs[pairs.length - 1];
  const added: number[] = [];
  for (let a = 0; a < na; a++) if (a2b[a] < 0) added.push(a);
  const removed: number[] = [];
  for (let b = 0; b < nb; b++) if (b2a[b] < 0) removed.push(b);
  return { order, a2b, b2a, added, removed, moved, delta: last ? last[1] - last[0] : 0 };
}

/** Lines that line up one to one (a tab added or removed has the other side empty). */
function sameLines(nb: number, na: number): Lines {
  const n = Math.min(nb, na);
  const b2a = new Int32Array(nb).fill(-1);
  const a2b = new Int32Array(na).fill(-1);
  for (let i = 0; i < n; i++) b2a[i] = a2b[i] = i;
  const order = Array.from({ length: Math.max(nb, na) }, (_, i) => ({ a: i < na ? i : -1, b: i < nb ? i : -1 }));
  return { order, a2b, b2a, added: [], removed: [], moved: [], delta: 0 };
}

// ---- headers, keys and the columns' and rows' alignment ---------------------------------------------------------------

/** The first row is a row of names: words, none repeated, none a formula. */
function headerRow(g: Grid): boolean {
  const row = g.rows.get(0);
  if (!row || g.nr < 2) return false;
  const seen = new Set<string>();
  for (const cell of row.values()) {
    if (!filled(cell)) continue;
    if (cell.f !== undefined || typeof cell.v !== 'string') return false;
    const k = cell.v.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return seen.size >= Math.min(2, g.nc);
}

const words = (cell: Cell | undefined) => (cell && cell.f === undefined && typeof cell.v === 'string' ? cell.v.trim().toLowerCase() : '');

/** A column's cells as a bag of what they hold (at most the first 4000), to tell how alike two columns are. */
function colBag(g: Grid, c: number, from: number): Map<string, number> {
  const bag = new Map<string, number>();
  let n = 0;
  for (let r = from; r < g.nr && n < 4000; r++) {
    const s = cellSig(cellAt(g, r, c), r, c);
    if (!s) continue;
    bag.set(s, (bag.get(s) ?? 0) + 1);
    n++;
  }
  return bag;
}

function bagSim(x: Map<string, number>, y: Map<string, number>): number {
  let both = 0;
  let all = 0;
  for (const [k, n] of x) {
    const m = y.get(k) ?? 0;
    both += Math.min(n, m);
    all += Math.max(n, m);
  }
  for (const [k, m] of y) if (!x.has(k)) all += m;
  return all ? both / all : 1;
}

function alignCols(gb: Grid, ga: Grid, header: boolean): Lines {
  const from = header ? 1 : 0;
  const bagsB = Array.from({ length: gb.nc }, (_, c) => colBag(gb, c, from));
  const bagsA = Array.from({ length: ga.nc }, (_, c) => colBag(ga, c, from));
  const sigOf = (g: Grid, bags: Map<string, number>[], c: number) => {
    const h = header ? words(cellAt(g, 0, c)) : '';
    if (h) return `h:${h}`;
    const items = [...bags[c]].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    return items.length ? `c:${items.map(([k, n]) => `${n}\u0001${k}`).join('\u0002')}` : '';
  };
  const sb = Array.from({ length: gb.nc }, (_, c) => sigOf(gb, bagsB, c));
  const sa = Array.from({ length: ga.nc }, (_, c) => sigOf(ga, bagsA, c));
  const sim: Sim = (b, a) => {
    const hb = header ? words(cellAt(gb, 0, b)) : '';
    const ha = header ? words(cellAt(ga, 0, a)) : '';
    if (hb && ha && hb === ha) return 1;
    return bagSim(bagsB[b], bagsA[a]) * (hb && ha ? 0.9 : 1);
  };
  return linesOf(gb.nc, ga.nc, sb, sa, sim, false);
}

/** A key's text, or '' when the cell cannot be one (empty, a formula, a fraction, TRUE or FALSE). */
function keyText(cell: Cell | undefined): string {
  if (!cell || cell.f !== undefined) return '';
  const v = cell.v;
  if (typeof v === 'string') return v.trim() ? `s${v.trim().toLowerCase()}` : '';
  if (typeof v === 'number' && Number.isInteger(v)) return `n${v}`;
  return '';
}

/**
 * The key column, when the table has one: of the first columns in both versions, the leftmost whose keys are filled in
 * (in most rows that hold anything), never repeat, and are mostly the same ones in both.
 */
function keyColumn(gb: Grid, ga: Grid, cols: Lines, from: number): { cb: number; ca: number } | null {
  const rowsWith = (g: Grid) => {
    let n = 0;
    for (const [r, row] of g.rows) if (r >= from && [...row.values()].some(filled)) n++;
    return n;
  };
  const nb = rowsWith(gb);
  const na = rowsWith(ga);
  if (nb < 3 || na < 3) return null;
  const keysOf = (g: Grid, c: number, n: number): Set<string> | null => {
    const keys = new Set<string>();
    let count = 0;
    for (const [r, row] of g.rows) {
      if (r < from) continue;
      const cell = row.get(c);
      if (!filled(cell)) continue;
      const k = keyText(cell);
      if (!k || keys.has(k)) return null;
      keys.add(k);
      count++;
    }
    return count >= 3 && count >= 0.8 * n ? keys : null;
  };
  let tried = 0;
  for (const { a, b } of cols.order) {
    if (a < 0 || b < 0) continue;
    if (++tried > 8) break;
    const kb = keysOf(gb, b, nb);
    const ka = kb && keysOf(ga, a, na);
    if (!kb || !ka) continue;
    let common = 0;
    for (const k of ka) if (kb.has(k)) common++;
    if (common >= 0.5 * Math.min(kb.size, ka.size)) return { cb: b, ca: a };
  }
  return null;
}

function alignRows(gb: Grid, ga: Grid, cols: Lines, header: boolean): { rows: Lines; rule: RowRule } {
  const from = header ? 1 : 0;
  const pairs: [number, number][] = [];
  for (const { a, b } of cols.order) if (a >= 0 && b >= 0) pairs.push([b, a]);
  const key = keyColumn(gb, ga, cols, from);
  const rowSig = (g: Grid, r: number, side: 0 | 1) => {
    if (header && r === 0) return '\u0000header';
    const row = g.rows.get(r);
    if (!row) return '';
    if (key) {
      const k = keyText(row.get(side ? key.ca : key.cb));
      if (k) return `k:${k}`;
    }
    let out = '';
    let any = false;
    for (const p of pairs) {
      const c = p[side];
      const s = cellSig(row.get(c), r, c);
      if (s) any = true;
      out += `${s}\u0001`;
    }
    return any ? `c:${out}` : '';
  };
  const sb = Array.from({ length: gb.nr }, (_, r) => rowSig(gb, r, 0));
  const sa = Array.from({ length: ga.nr }, (_, r) => rowSig(ga, r, 1));
  // Each row's cells, in the columns both versions have, worked out once (pairing rows asks for them again and again).
  const sigsB = new Map<number, string[]>();
  const sigsA = new Map<number, string[]>();
  const sigs = (g: Grid, r: number, side: 0 | 1, memo: Map<number, string[]>) => {
    let s = memo.get(r);
    if (!s) {
      const row = g.rows.get(r);
      s = pairs.map((p) => cellSig(row?.get(p[side]), r, p[side]));
      memo.set(r, s);
    }
    return s;
  };
  const sim: Sim = (b, a) => {
    if (!gb.rows.has(b) && !ga.rows.has(a)) return 1;
    const x = sigs(gb, b, 0, sigsB);
    const y = sigs(ga, a, 1, sigsA);
    let same = 0;
    let all = 0;
    for (let k = 0; k < x.length; k++) {
      if (!x[k] && !y[k]) continue;
      all++;
      if (x[k] === y[k]) same++;
    }
    return all ? same / all : 1;
  };
  const rows = linesOf(gb.nr, ga.nr, sb, sa, sim, true);
  const head = key && header ? cellAt(ga, 0, key.ca) : undefined;
  return {
    rows,
    rule: key ? { by: 'key', col: key.ca, ...(head && typeof head.v === 'string' && head.v.trim() ? { header: head.v.trim() } : {}) } : { by: 'content' },
  };
}

// ---- formulas followed through the rows and columns that moved ----------------------------------------------------------

/** A line of the older version where it is in the newer one: how = 0 a cell's (gone: -1), 1 a range's start, 2 its end. */
function mapLine(l: Lines, i: number, how: 0 | 1 | 2): number {
  const n = l.b2a.length;
  if (i >= n) return Math.max(0, i + l.delta);
  const v = l.b2a[i];
  if (v >= 0) return v;
  if (how === 0) return -1;
  if (how === 1) {
    for (let k = i + 1; k < n; k++) if (l.b2a[k] >= 0) return l.b2a[k];
    return Math.max(0, n + l.delta);
  }
  for (let k = i - 1; k >= 0; k--) if (l.b2a[k] >= 0) return l.b2a[k];
  return -1;
}

function mapRef(ref: RefTok, rows: Lines | undefined, cols: Lines | undefined): RefTok | null {
  const part = (p: RefPart, how: 0 | 1 | 2): RefPart | null => {
    const q = { ...p };
    if (q.r !== undefined && rows) {
      const r = mapLine(rows, q.r, how);
      if (r < 0) return null;
      q.r = r;
    }
    if (q.c !== undefined && cols) {
      const c = mapLine(cols, q.c, how);
      if (c < 0) return null;
      q.c = c;
    }
    return q;
  };
  const a = part(ref.a, ref.b ? 1 : 0);
  const b = ref.b ? part(ref.b, 2) : undefined;
  if (!a || b === null) return null;
  if (b && ((a.r ?? 0) > (b.r ?? 0) || (a.c ?? 0) > (b.c ?? 0))) return null;
  return b ? { ...ref, a, b } : { ...ref, a };
}

/** What every tab pair's lines are, for formulas that reach into other tabs. */
interface Pairs {
  list: { b?: Sheet; a?: Sheet; rows?: Lines; cols?: Lines }[];
  byNameB: Map<string, number>;
  byNameA: Map<string, number>;
}

/** A formula as it reads in the newer version: the older one's followed through the rows and columns that moved (`text`: written with the newer tabs' names), or the newer one's own. */
function formulaIn(f: string, on: number, ps: Pairs, side: 'b' | 'a', text = false, lines?: { rows?: Lines; cols?: Lines }): string {
  let out = '';
  let last = 0;
  for (const x of formulaRefs(f)) {
    out += f.slice(last, x.s);
    last = x.e;
    const p = x.ref.sheet ? (side === 'b' ? ps.byNameB : ps.byNameA).get(x.ref.sheet.toLowerCase()) : on;
    const pair = p === undefined ? undefined : ps.list[p];
    if (!pair || (side === 'b' && !pair.a)) {
      out += text ? f.slice(x.s, x.e) : `?${(x.ref.sheet ?? '').toLowerCase()}!${refText(x.ref)}`;
      continue;
    }
    const own = p === on && lines ? lines : pair;
    const ref = side === 'b' ? mapRef(x.ref, own.rows, own.cols) : x.ref;
    if (!ref) {
      out += '#REF!';
      continue;
    }
    out += text ? `${x.ref.sheet ? `${quoteSheet(pair.a!.name)}!` : ''}${refText(ref)}` : `${p}!${refText(ref)}`;
  }
  out += f.slice(last);
  return text ? out : out.replace(/\s+/g, '').toUpperCase();
}

// ---- cells -----------------------------------------------------------------------------------------------------------

const FMT_KEYS = ['fmt', 'dp', 'cur', 'code'] as const;
const fmtOf = (s: CellStyle | undefined) => JSON.stringify(FMT_KEYS.map((k) => s?.[k] ?? null));
function lookOf(s: CellStyle | undefined): string {
  if (!s) return '';
  const rest = Object.entries(s)
    .filter(([k, v]) => !(FMT_KEYS as readonly string[]).includes(k) && v !== undefined)
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));
  return rest.length ? JSON.stringify(rest) : '';
}
const shownAt = (calc: Calc, si: number, r: number, c: number, cell: Cell | undefined) => {
  if (!cell) return '';
  try {
    return formatValue(calc.value(si, r, c), cell.s);
  } catch {
    return '';
  }
};

// ---- other parts of a tab --------------------------------------------------------------------------------------------

/** Ranges ("A2:C9", several split by commas) of the older version where they are in the newer one. */
function mapRanges(text: string, rows: Lines, cols: Lines): string {
  return text.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?/g, (all, d1, c1, d2, r1, d3, c2, d4, r2) => {
    const ref: RefTok = {
      a: { c: colIndex(c1), r: Number(r1) - 1, ac: !!d1, ar: !!d2 },
      ...(c2 ? { b: { c: colIndex(c2), r: Number(r2) - 1, ac: !!d3, ar: !!d4 } } : {}),
    };
    const m = mapRef(ref, rows, cols);
    return m ? refText(m) : all;
  });
}


function otherParts(b: Sheet, a: Sheet, rows: Lines, cols: Lines): OtherPart[] {
  const ranged = <T extends { range?: string }>(list: T[] | undefined, from: boolean) =>
    JSON.stringify((list ?? []).map((x) => (from && x.range ? { ...x, range: mapRanges(x.range, rows, cols) } : x)));
  const charts = (list: Sheet['charts'], from: boolean) => JSON.stringify((list ?? []).map(({ from: _f, to: _t, ...x }) => (from ? { ...x, range: mapRanges(x.range, rows, cols) } : x)));
  const json = (v: unknown) => JSON.stringify(v ?? null);
  const parts: [OtherPart, boolean][] = [
    ['charts', charts(b.charts, true) !== charts(a.charts, false)],
    ['merges', JSON.stringify((b.merges ?? []).map((m) => mapRanges(m, rows, cols))) !== JSON.stringify(a.merges ?? [])],
    ['filter', json(b.filter ? { ...b.filter, range: mapRanges(b.filter.range, rows, cols) } : null) !== json(a.filter)],
    ['conditional', ranged(b.conditional, true) !== ranged(a.conditional, false)],
    ['validation', ranged(b.validation, true) !== ranged(a.validation, false)],
    ['freeze', json(b.freeze) !== json(a.freeze)],
    ['protect', ranged(b.protect, true) !== ranged(a.protect, false)],
    ['groups', ranged(b.groups, true) !== ranged(a.groups, false)],
    ['tabColor', (b.tabColor ?? '') !== (a.tabColor ?? '')],
    ['hidden', !!b.hidden !== !!a.hidden],
    ['board', json(b.board) !== json(a.board)],
    ['pivot', json(b.pivot) !== json(a.pivot)],
    ['print', json(b.print) !== json(a.print)],
  ];
  return parts.filter(([, changed]) => changed).map(([part]) => part);
}

// ---- tabs ----------------------------------------------------------------------------------------------------------

/** How alike two sheets' cells are, by what they hold (for a tab renamed). */
function sheetSim(b: Sheet, a: Sheet): number {
  const bag = (s: Sheet) => {
    const m = new Map<string, number>();
    let n = 0;
    for (const name in s.cells) {
      if (n++ > 4000) break;
      const k = keyOf(name);
      const sig = k < 0 ? '' : cellSig(s.cells[name], unpackR(k), unpackC(k));
      if (sig) m.set(sig, (m.get(sig) ?? 0) + 1);
    }
    return m;
  };
  return bagSim(bag(b), bag(a));
}

/** The tabs of the two versions paired: by id, then by name, then (for a tab renamed) by what they hold. */
function pairTabs(before: Workbook, after: Workbook): [number, number][] {
  const out: [number, number][] = [];
  const usedB = new Set<number>();
  const usedA = new Set<number>();
  const take = (bi: number, ai: number) => {
    out.push([bi, ai]);
    usedB.add(bi);
    usedA.add(ai);
  };
  after.sheets.forEach((s, ai) => {
    const bi = before.sheets.findIndex((x, i) => !usedB.has(i) && x.id === s.id);
    if (bi >= 0) take(bi, ai);
  });
  after.sheets.forEach((s, ai) => {
    if (usedA.has(ai)) return;
    const bi = before.sheets.findIndex((x, i) => !usedB.has(i) && x.name.toLowerCase() === s.name.toLowerCase());
    if (bi >= 0) take(bi, ai);
  });
  const leftB = before.sheets.map((_, i) => i).filter((i) => !usedB.has(i));
  const leftA = after.sheets.map((_, i) => i).filter((i) => !usedA.has(i));
  if (leftB.length && leftA.length) {
    const cands: { bi: number; ai: number; s: number }[] = [];
    for (const bi of leftB) for (const ai of leftA) cands.push({ bi, ai, s: sheetSim(before.sheets[bi], after.sheets[ai]) });
    cands.sort((x, y) => y.s - x.s);
    for (const c of cands) if (c.s >= ALIKE && !usedB.has(c.bi) && !usedA.has(c.ai)) take(c.bi, c.ai);
    // One left on each side, both empty (a blank tab renamed): the same tab.
    const lb = before.sheets.map((_, i) => i).filter((i) => !usedB.has(i));
    const la = after.sheets.map((_, i) => i).filter((i) => !usedA.has(i));
    if (lb.length === 1 && la.length === 1 && !Object.keys(before.sheets[lb[0]].cells).length && !Object.keys(after.sheets[la[0]].cells).length) take(lb[0], la[0]);
  }
  return out;
}

const EMPTY: Sheet = { id: '', name: '', cells: {} };

/** What changed from `before` to `after` (the version after, or the workbook as it is in the editor now). */
export function diffBooks(before: Workbook, after: Workbook, o: { calcBefore?: Calc; calcAfter?: Calc } = {}): BookDiff {
  const calcB = o.calcBefore ?? computeBook(before);
  const calcA = o.calcAfter ?? computeBook(after);
  const pairs = pairTabs(before, after);
  const aOf = new Map(pairs.map(([b, a]) => [a, b]));
  const bOf = new Map(pairs.map(([b, a]) => [b, a]));
  // The tabs in the order they show: the newer version's, each removed one after the tab it followed.
  const shown: { b: number; a: number }[] = after.sheets.map((_, a) => ({ a, b: aOf.get(a) ?? -1 }));
  before.sheets.forEach((_, b) => {
    if (bOf.has(b)) return;
    let at = 0;
    for (let k = b - 1; k >= 0; k--) {
      const i = shown.findIndex((x) => x.b === k);
      if (i >= 0) {
        at = i + 1;
        break;
      }
    }
    shown.splice(at, 0, { a: -1, b });
  });

  const ps: Pairs = { list: [], byNameB: new Map(), byNameA: new Map() };
  const grids: { gb: Grid; ga: Grid; header: boolean; rule: RowRule }[] = [];
  for (const { a, b } of shown) {
    const sb = b >= 0 ? before.sheets[b] : undefined;
    const sa = a >= 0 ? after.sheets[a] : undefined;
    const gb = gridOf(sb ?? EMPTY);
    const ga = gridOf(sa ?? EMPTY);
    let rows: Lines;
    let cols: Lines;
    let rule: RowRule = { by: 'content' };
    const header = !!sb && !!sa && headerRow(gb) && headerRow(ga);
    if (sb && sa) {
      cols = alignCols(gb, ga, header);
      const r = alignRows(gb, ga, cols, header);
      rows = r.rows;
      rule = r.rule;
    } else {
      rows = sameLines(gb.nr, ga.nr);
      cols = sameLines(gb.nc, ga.nc);
    }
    const i = ps.list.length;
    ps.list.push({ b: sb, a: sa, rows, cols });
    if (sb) ps.byNameB.set(sb.name.toLowerCase(), i);
    if (sa) ps.byNameA.set(sa.name.toLowerCase(), i);
    grids.push({ gb, ga, header, rule });
  }

  const tabs: TabDiff[] = shown.map(({ a, b }, i) => {
    const { gb, ga, header, rule } = grids[i];
    const { rows, cols } = ps.list[i] as Required<Pairs['list'][number]>;
    const sb = ps.list[i].b;
    const sa = ps.list[i].a;
    const cells: CellChange[] = [];
    const results: ResultChange[] = [];
    if (sb && sa) {
      const compare = (cb: Cell | undefined, ca: Cell | undefined, br: number, bc: number, r: number, c: number) => {
        const fb = cb?.f;
        const fa = ca?.f;
        let what: CellKind | null = null;
        let sameFormula = false;
        if (fb !== undefined || fa !== undefined) {
          sameFormula = fb !== undefined && fa !== undefined && formulaIn(fb, i, ps, 'b') === formulaIn(fa, i, ps, 'a');
          if (!sameFormula) what = 'formula';
        } else {
          const vb = cb?.v ?? '';
          const va = ca?.v ?? '';
          if (vb !== va) what = 'value';
        }
        const fmt = fmtOf(cb?.s) !== fmtOf(ca?.s);
        const look = lookOf(cb?.s) !== lookOf(ca?.s);
        const note = (cb?.note ?? '') !== (ca?.note ?? '') || (cb?.link ?? '') !== (ca?.link ?? '');
        const kind = what ?? (fmt ? 'format' : look ? 'style' : note ? 'note' : null);
        if (!kind) {
          if (sameFormula) {
            const was = shownAt(calcB, b, br, bc, cb);
            const now = shownAt(calcA, a, r, c, ca);
            if (was !== now) results.push({ r, c, br, bc, formula: inputText(ca), before: was, after: now });
          }
          return;
        }
        cells.push({
          kind,
          r,
          c,
          br,
          bc,
          before: { input: inputText(cb), shown: shownAt(calcB, b, br, bc, cb) },
          after: { input: inputText(ca), shown: shownAt(calcA, a, r, c, ca) },
          ...(what && (fmt || look) ? { look: true } : {}),
        });
      };
      const seen = new Set<number>();
      for (const [br, row] of gb.rows) {
        const r = rows.b2a[br];
        if (r < 0) continue;
        for (const [bc, cell] of row) {
          const c = cols.b2a[bc];
          if (c < 0) continue;
          seen.add(pack(r, c));
          compare(cell, cellAt(ga, r, c), br, bc, r, c);
        }
      }
      for (const [r, row] of ga.rows) {
        const br = rows.a2b[r];
        if (br < 0) continue;
        for (const [c, cell] of row) {
          const bc = cols.a2b[c];
          if (bc < 0 || seen.has(pack(r, c))) continue;
          compare(undefined, cell, br, bc, r, c);
        }
      }
      const byPlace = (x: { r: number; c: number }, y: { r: number; c: number }) => x.r - y.r || x.c - y.c;
      cells.sort(byPlace);
      results.sort(byPlace);
    }
    const other = sb && sa ? otherParts(sb, sa, rows, cols) : [];
    const status = sb && sa ? 'kept' : sa ? 'added' : 'removed';
    const was = sb && sa && sb.name !== sa.name ? sb.name : undefined;
    const changed = status !== 'kept' || !!was || cells.length > 0 || rows.added.length + rows.removed.length + rows.moved.length + cols.added.length + cols.removed.length > 0 || other.length > 0;
    return {
      name: (sa ?? sb)!.name,
      ...(was ? { was } : {}),
      status,
      ai: a,
      bi: b,
      id: (sa ?? sb)!.id,
      rows,
      cols,
      cells,
      results,
      rule,
      header,
      other,
      changed,
    };
  });

  const kept = tabs.filter((t) => t.status === 'kept');
  const sum = (f: (t: TabDiff) => number) => kept.reduce((n, t) => n + f(t), 0);
  const names = JSON.stringify(before.names ?? []) !== JSON.stringify(after.names ?? []);
  const totals = {
    cells: sum((t) => t.cells.length),
    cellTabs: kept.filter((t) => t.cells.length).length,
    tabs: tabs.filter((t) => t.changed).length,
    rowsAdded: sum((t) => t.rows.added.length),
    rowsRemoved: sum((t) => t.rows.removed.length),
    rowsMoved: sum((t) => t.rows.moved.length),
    colsAdded: sum((t) => t.cols.added.length),
    colsRemoved: sum((t) => t.cols.removed.length),
    tabsAdded: tabs.filter((t) => t.status === 'added').length,
    tabsRemoved: tabs.filter((t) => t.status === 'removed').length,
    tabsRenamed: kept.filter((t) => t.was).length,
    results: sum((t) => t.results.length),
  };
  return { tabs, names, totals, same: !names && !totals.tabs };
}

// ---- putting one change back ----------------------------------------------------------------------------------------------

/** One change of a diff to put back, by its tab's place in `diff.tabs`. */
export type PutBack =
  | { k: 'cell'; tab: number; r: number; c: number }
  | { k: 'row-added'; tab: number; a: number }
  | { k: 'row-removed'; tab: number; b: number }
  | { k: 'col-added'; tab: number; a: number }
  | { k: 'col-removed'; tab: number; b: number }
  | { k: 'tab-added'; tab: number }
  | { k: 'tab-removed'; tab: number }
  | { k: 'tab-renamed'; tab: number };

/** The pairs of a diff's tabs again, for writing the older version's formulas into the newer one. */
function pairsOf(before: Workbook, after: Workbook, diff: BookDiff): Pairs {
  const ps: Pairs = { list: [], byNameB: new Map(), byNameA: new Map() };
  diff.tabs.forEach((t, i) => {
    const b = t.bi >= 0 ? before.sheets[t.bi] : undefined;
    const a = t.ai >= 0 ? after.sheets[t.ai] : undefined;
    ps.list.push({ b, a, rows: t.rows, cols: t.cols });
    if (b) ps.byNameB.set(b.name.toLowerCase(), i);
    if (a) ps.byNameA.set(a.name.toLowerCase(), i);
  });
  return ps;
}

/** Lines with one more put in at `at` of the newer version (the older line `b` going there). */
function withInserted(l: Lines, at: number, b: number): Lines {
  const b2a = l.b2a.map((v) => (v >= at ? v + 1 : v));
  b2a[b] = at;
  return { ...l, b2a, delta: l.delta + 1 };
}

const cellCopy = (cell: Cell, f: string | undefined): Cell => {
  const out: Cell = JSON.parse(JSON.stringify(cell)) as Cell;
  if (f !== undefined) out.f = f;
  return out;
};

/** Where a line the newer version lost would go back: before the next line it shows. */
function placeOf(l: Lines, b: number, n: number): number {
  const i = l.order.findIndex((x) => x.a < 0 && x.b === b);
  for (let k = i + 1; k < l.order.length; k++) if (l.order[k].a >= 0) return l.order[k].a;
  return n;
}

/**
 * The newer workbook with one change of `diff` (diffBooks(before, after)) undone: a cell as it was (its formula written
 * for where it is now), a row or column added taken out, one removed put back where it was, a tab added taken out, one
 * removed put back, one renamed given its name back. Throws when it cannot be (the only tab).
 */
export function putBack(before: Workbook, after: Workbook, diff: BookDiff, what: PutBack): Workbook {
  const t = diff.tabs[what.tab];
  if (!t) throw new Error('That change is no longer there.');
  const sa = t.ai >= 0 ? after.sheets[t.ai] : undefined;
  const sb = t.bi >= 0 ? before.sheets[t.bi] : undefined;
  const withCells = (book: Workbook, id: string, set: Record<string, Cell | null>, extra?: (s: Sheet) => Sheet): Workbook => ({
    ...book,
    sheets: book.sheets.map((s) => {
      if (s.id !== id) return s;
      const cells = { ...s.cells };
      for (const [k, v] of Object.entries(set)) {
        if (v) cells[k] = v;
        else delete cells[k];
      }
      const next = { ...s, cells };
      return extra ? extra(next) : next;
    }),
  });
  switch (what.k) {
    case 'cell': {
      const ch = t.cells.find((x) => x.r === what.r && x.c === what.c);
      if (!sa || !sb || !ch) throw new Error('That change is no longer there.');
      const was = sb.cells[refName(ch.br, ch.bc)];
      const ps = pairsOf(before, after, diff);
      return withCells(after, sa.id, { [refName(ch.r, ch.c)]: was ? cellCopy(was, was.f !== undefined ? formulaIn(was.f, what.tab, ps, 'b', true) : undefined) : null });
    }
    case 'row-added':
    case 'col-added': {
      if (!sa) throw new Error('That change is no longer there.');
      return adjustForDelete(after, sa.id, what.k === 'row-added' ? 'row' : 'col', what.a, 1);
    }
    case 'row-removed':
    case 'col-removed': {
      if (!sa || !sb) throw new Error('That change is no longer there.');
      const rowWise = what.k === 'row-removed';
      const l = rowWise ? t.rows : t.cols;
      const at = placeOf(l, what.b, l.a2b.length);
      const grown = adjustForInsert(after, sa.id, rowWise ? 'row' : 'col', at, 1);
      const lines = rowWise ? { rows: withInserted(t.rows, at, what.b), cols: t.cols } : { rows: t.rows, cols: withInserted(t.cols, at, what.b) };
      const ps = pairsOf(before, after, diff);
      const set: Record<string, Cell> = {};
      for (const name in sb.cells) {
        const k = keyOf(name);
        if (k < 0) continue;
        const r = unpackR(k);
        const c = unpackC(k);
        if ((rowWise ? r : c) !== what.b) continue;
        const to = rowWise ? lines.cols.b2a[c] : lines.rows.b2a[r];
        if (to < 0) continue;
        const cell = sb.cells[name];
        set[rowWise ? refName(at, to) : refName(to, at)] = cellCopy(cell, cell.f !== undefined ? formulaIn(cell.f, what.tab, ps, 'b', true, lines) : undefined);
      }
      return withCells(grown, sa.id, set, (s) => {
        // The row's height (or column's width) and whether it was hidden come back too.
        const size = rowWise ? sb.rows?.[what.b] : sb.cols?.[what.b];
        if (!size) return s;
        return rowWise ? { ...s, rows: { ...(s.rows ?? {}), [at]: { ...size } } } : { ...s, cols: { ...(s.cols ?? {}), [at]: { ...size } } };
      });
    }
    case 'tab-added': {
      if (!sa) throw new Error('That change is no longer there.');
      if (after.sheets.filter((s) => !s.hidden && s.id !== sa.id).length === 0) throw new Error('A workbook keeps at least one tab that shows.');
      return removeSheet(after, sa.id);
    }
    case 'tab-removed': {
      if (!sb) throw new Error('That change is no longer there.');
      if (after.sheets.length >= SHEET_LIMITS.sheets) throw new Error(`A workbook holds at most ${SHEET_LIMITS.sheets} tabs.`);
      const copy = JSON.parse(JSON.stringify(sb)) as Sheet;
      if (after.sheets.some((s) => s.id === copy.id)) copy.id = newId();
      copy.name = uniqueSheetName(copy.name, after.sheets.map((s) => s.name));
      // Back where it was: before the next tab that shows in the newer version.
      let at = after.sheets.length;
      for (let k = what.tab + 1; k < diff.tabs.length; k++)
        if (diff.tabs[k].ai >= 0) {
          at = diff.tabs[k].ai;
          break;
        }
      const sheets = [...after.sheets];
      sheets.splice(at, 0, copy);
      return { ...after, sheets };
    }
    case 'tab-renamed': {
      if (!sa || !t.was) throw new Error('That change is no longer there.');
      return renameSheet(after, sa.id, uniqueSheetName(t.was, after.sheets.filter((s) => s.id !== sa.id).map((s) => s.name)));
    }
  }
}
