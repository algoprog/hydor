// Groups of rows and columns (an outline, as Excel's and Google Sheets' Group): each a span of rows ("3:7") or columns
// ("C:E") under a bracket, nested ones a level deeper, folded away (hidden) with − and shown again with +; and the
// protection of cells (Data → Protect sheets and ranges): which cells warn before they change, and which refuse to.
import { colIndex, colName, rectsOf, type Sheet, type SheetGroup, type SheetProtect } from './sheets.ts';

export interface Span {
  /** Its place in the sheet's list of groups. */
  i: number;
  a: number;
  b: number;
  /** 1 for an outermost group, 2 for one inside it… */
  level: number;
  hidden: boolean;
}

/** A group's rows or columns, from 0, and which they are. */
export function spanOf(g: SheetGroup): { axis: 'row' | 'col'; a: number; b: number } | null {
  const rows = /^(\d+):(\d+)$/.exec(g.range);
  if (rows) return { axis: 'row', a: Number(rows[1]) - 1, b: Number(rows[2]) - 1 };
  const cols = /^([A-Z]+):([A-Z]+)$/.exec(g.range);
  return cols ? { axis: 'col', a: colIndex(cols[1]), b: colIndex(cols[2]) } : null;
}

/** A sheet's groups of rows and of columns, each with its level (one inside another a level deeper), outermost first. */
export function spansOf(sh: Sheet): { rows: Span[]; cols: Span[] } {
  const out = { rows: [] as Span[], cols: [] as Span[] };
  (sh.groups ?? []).forEach((g, i) => {
    const s = spanOf(g);
    if (s) (s.axis === 'row' ? out.rows : out.cols).push({ i, a: s.a, b: s.b, level: 1, hidden: !!g.hidden });
  });
  for (const list of [out.rows, out.cols]) {
    list.sort((x, y) => x.a - y.a || y.b - x.b);
    for (const s of list) s.level = 1 + list.filter((t) => t !== s && t.a <= s.a && t.b >= s.b && (t.a < s.a || t.b > s.b)).length;
  }
  return out;
}

const rangeOf = (axis: 'row' | 'col', a: number, b: number) => (axis === 'row' ? `${a + 1}:${b + 1}` : `${colName(a)}:${colName(b)}`);

/** Rows (columns) a to b grouped: a group of its own, inside or around those there are (not one that crosses another). */
export function addGroup(sh: Sheet, axis: 'row' | 'col', a: number, b: number): SheetGroup[] | null {
  const spans = spansOf(sh)[axis === 'row' ? 'rows' : 'cols'];
  if (spans.some((s) => (s.a < a && s.b >= a && s.b < b) || (s.a > a && s.a <= b && s.b > b))) return null;
  if (spans.some((s) => s.a === a && s.b === b) || spans.filter((s) => s.a <= a && s.b >= b).length >= 7) return null;
  return [...(sh.groups ?? []), { range: rangeOf(axis, a, b) }];
}

/** Rows (columns) a to b ungrouped: the innermost group they are in, or those inside them. */
export function removeGroup(sh: Sheet, axis: 'row' | 'col', a: number, b: number): SheetGroup[] | null {
  const spans = spansOf(sh)[axis === 'row' ? 'rows' : 'cols'];
  const inside = spans.filter((s) => s.a >= a && s.b <= b);
  const around = spans.filter((s) => s.a <= a && s.b >= b).sort((x, y) => y.level - x.level)[0];
  const gone = new Set(inside.length ? inside.map((s) => s.i) : around ? [around.i] : []);
  if (!gone.size) return null;
  return (sh.groups ?? []).filter((_, i) => !gone.has(i));
}

/**
 * A group folded away (or shown again): the group marked, and its rows (columns) hidden, or shown but for those of a
 * group inside it that stays folded.
 */
export function foldGroup(sh: Sheet, i: number, hide: boolean): Pick<Sheet, 'groups' | 'rows' | 'cols'> {
  const g = sh.groups?.[i];
  const s = g && spanOf(g);
  const groups = (sh.groups ?? []).map((x, j) => (j === i ? (hide ? { ...x, hidden: true } : { range: x.range }) : x));
  if (!s) return { groups, rows: sh.rows, cols: sh.cols };
  const row = s.axis === 'row';
  const sizes = { ...((row ? sh.rows : sh.cols) ?? {}) } as Record<number, { w?: number; h?: number; hidden?: boolean }>;
  const folded = hide ? [] : spansOf({ ...sh, groups })[row ? 'rows' : 'cols'].filter((t) => t.hidden && t.a >= s.a && t.b <= s.b);
  for (let k = s.a; k <= s.b; k++) {
    const keep = folded.some((t) => k >= t.a && k <= t.b);
    const cur = { ...(sizes[k] ?? {}) };
    if (hide || keep) cur.hidden = true;
    else delete cur.hidden;
    if (Object.keys(cur).length) sizes[k] = cur;
    else delete sizes[k];
  }
  const kept = Object.keys(sizes).length ? sizes : undefined;
  return row ? { groups, rows: kept as Sheet['rows'], cols: sh.cols } : { groups, rows: sh.rows, cols: kept as Sheet['cols'] };
}

// ---- protection -------------------------------------------------------------------------------------------------------

/** The protection a cell is under (its own range's, else the whole sheet's unless it is left open), or null. */
export function protectionAt(sh: Sheet, r: number, c: number): SheetProtect | null {
  if (!sh.protect?.length) return null;
  const inR = (ranges: string | undefined) => !!ranges && rectsOf(ranges).some((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);
  return sh.protect.find((p) => p.range && inR(p.range)) ?? sh.protect.find((p) => !p.range && !inR(p.except)) ?? null;
}

/** Of some cells (by row and column) to be changed: the protection that refuses a change to one, else one that warns first. */
export function guardOf(sh: Sheet, cells: Iterable<[number, number]>): { refuse?: SheetProtect; warn?: SheetProtect } {
  if (!sh.protect?.length) return {};
  let warn: SheetProtect | undefined;
  for (const [r, c] of cells) {
    const p = protectionAt(sh, r, c);
    if (!p) continue;
    if (!p.warn) return { refuse: p };
    warn ??= p;
  }
  return warn ? { warn } : {};
}
