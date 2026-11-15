// A row in a Library spreadsheet for each result an agent hands back (its "A row in a spreadsheet" place): when it ran,
// then one column per field, in the fields' order. The columns are found by their headings in the table's first row,
// so a person may move them, put columns of their own between them, restyle them and add formulas beside them; a
// field with no heading yet gets a new column at the end, never moving the others. The row goes under the table's
// last one; a formula in a column of the person's own is carried down to it, as a spreadsheet's table does, and a
// chart that read the rows so far reads the new one too. The workbook is saved as a new version, as any edit is, so its
// formulas, charts, comments and styles stay as they were.
import { cellText, type AnswerField } from '../../shared/apps.ts';
import {
  chartParts,
  cleanLink,
  cleanSheetName,
  keyOf,
  newId,
  nowSerial,
  parseDate,
  quoteSheet,
  rangeName,
  refName,
  SHEET_LIMITS,
  shiftFormula,
  uniqueSheetName,
  unpackC,
  unpackR,
  type Cell,
  type CellStyle,
  type Sheet,
  type Workbook,
} from '../../shared/sheets.ts';
import { CUT } from './results.ts';

/** The heading of the column for when each result came, and the tab a spreadsheet made for an agent's results has, in the languages the app speaks. */
export const SHEET_WORDS: Record<string, { when: string; tab: string }> = {
  en: { when: 'Date', tab: 'Results' },
  zh: { when: '日期', tab: '结果' },
  el: { when: 'Ημερομηνία', tab: 'Αποτελέσματα' },
};
export const WHEN = SHEET_WORDS.en.when;
export const RESULTS_TAB = SHEET_WORDS.en.tab;
/** Headings a person may have given that column instead, in any of them. */
const WHEN_WORDS = ['date', 'when', 'ran', 'run', 'time', 'date and time', 'ran at', '日期', '时间', 'ημερομηνία', 'πότε', 'ώρα'];

const norm = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** Markdown as plain words for one cell: no heading marks, emphasis or link syntax. */
function plain(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '$2')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)')
    .trim();
}

const cut = (s: string) => (s.length > SHEET_LIMITS.text ? `${s.slice(0, SHEET_LIMITS.text - 1)}…` : s);

/**
 * A field's value as a cell: numbers as numbers, yes or no as TRUE or FALSE, dates as dates, links as links, lists and
 * tables as readable text in one cell ("milk; eggs", "Rome · 3; Paris · 2"); null for an empty one. Text stays text,
 * even when it starts with "=".
 */
export function fieldCell(f: AnswerField, x: unknown): Cell | null {
  if (x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length)) return null;
  if (x === CUT) return { v: CUT };
  switch (f.type) {
    case 'number':
      return typeof x === 'number' && Number.isFinite(x) ? { v: x } : { v: cut(String(x)) };
    case 'yesno':
      return typeof x === 'boolean' ? { v: x } : { v: cut(String(x)) };
    case 'date': {
      const s = String(x);
      const d = /^\d{4}-\d{2}-\d{2}/.test(s) ? parseDate(s) : null;
      return d !== null ? { v: d, s: { fmt: 'date' } } : { v: cut(s) };
    }
    case 'url': {
      const link = cleanLink(String(x));
      return link ? { v: cut(String(x)), link } : { v: cut(String(x)) };
    }
    case 'list':
    case 'table':
      return Array.isArray(x) ? { v: cut(cellText(x)) } : { v: cut(String(x)) };
    case 'markdown':
      return { v: cut(plain(typeof x === 'string' ? x : JSON.stringify(x))) };
    default:
      return { v: cut(typeof x === 'string' ? x : JSON.stringify(x)) };
  }
}

/** How wide a new column starts, by its field's kind. */
const widthOf = (f: AnswerField | null) => (!f ? 150 : f.type === 'number' || f.type === 'yesno' || f.type === 'date' ? 110 : f.type === 'url' ? 220 : 260);

const hasWords = (c: Cell | undefined) => !!c && ((c.v !== undefined && c.v !== '') || c.f !== undefined);

export interface RowAdded {
  book: Workbook;
  /** The tab it went in, and its row (from 1). */
  tab: string;
  row: number;
  /** The headings of the columns added for it (none when every field had one). */
  added: string[];
}

/**
 * The workbook with one more row for a result: on the tab named (in any case; added when not there, and the first
 * when none is named), under a heading row (the tab's first row with anything in it; written now on an empty tab).
 * `book` is left as it was.
 */
export function addResultRow(book: Workbook, o: { tab?: string; fields: AnswerField[]; value: Record<string, unknown>; at: Date; when?: string }): RowAdded {
  const b = structuredClone(book) as Workbook;
  let sh: Sheet | undefined = o.tab ? b.sheets.find((s) => s.name.toLowerCase() === o.tab!.trim().toLowerCase()) : b.sheets[0];
  if (!sh) {
    if (b.sheets.length >= SHEET_LIMITS.sheets) throw new Error(`the spreadsheet has ${SHEET_LIMITS.sheets} tabs already, the most it may`);
    sh = { id: newId(), name: uniqueSheetName(cleanSheetName(o.tab), b.sheets.map((s) => s.name)), cells: {} };
    b.sheets.push(sh);
  }
  const cells = sh.cells;
  // Where the table is: its heading row, and how far down each column has words.
  let head = Number.MAX_SAFE_INTEGER;
  for (const ref in cells) {
    const k = keyOf(ref);
    if (k >= 0 && hasWords(cells[ref])) head = Math.min(head, unpackR(k));
  }
  const fresh = head === Number.MAX_SAFE_INTEGER;
  if (fresh) head = 0;
  const headings = new Map<string, number>();
  let lastCol = -1;
  const lowest = new Map<number, number>();
  for (const ref in cells) {
    const k = keyOf(ref);
    if (k < 0 || !hasWords(cells[ref])) continue;
    const [r, c] = [unpackR(k), unpackC(k)];
    if (r === head) {
      lastCol = Math.max(lastCol, c);
      const h = norm(cells[ref].v);
      if (h && !headings.has(h)) headings.set(h, c);
    } else if (r > head) lowest.set(c, Math.max(lowest.get(c) ?? head, r));
  }
  // Each field's column (and when's), by its heading; new ones at the end, in the fields' order.
  const added: string[] = [];
  const taken = new Set<number>();
  const columnFor = (labels: string[], heading: string, f: AnswerField | null): number => {
    for (const l of labels) {
      const c = headings.get(norm(l));
      if (c !== undefined && !taken.has(c)) {
        taken.add(c);
        return c;
      }
    }
    const c = ++lastCol;
    if (c >= SHEET_LIMITS.cols) throw new Error(`the tab has ${SHEET_LIMITS.cols} columns already, the most it may`);
    taken.add(c);
    cells[refName(head, c)] = { v: heading, s: { b: true } };
    sh!.cols = { ...sh!.cols, [c]: { ...sh!.cols?.[c], w: sh!.cols?.[c]?.w ?? widthOf(f) } };
    added.push(heading);
    return c;
  };
  const whenCol = columnFor([...(o.when ? [o.when] : []), ...WHEN_WORDS], o.when ?? WHEN, null);
  const cols = o.fields.map((f) => ({ f, c: columnFor([f.label, f.id], f.label.trim() || f.id, f) }));
  if (fresh) sh.freeze = { ...sh.freeze, rows: Math.max(sh.freeze?.rows ?? 0, head + 1) };
  // The row under the table's last one, by the columns written here.
  const last = Math.max(head, ...[whenCol, ...cols.map((x) => x.c)].map((c) => lowest.get(c) ?? head));
  const row = last + 1;
  if (row >= SHEET_LIMITS.rows) throw new Error(`the tab has ${SHEET_LIMITS.rows.toLocaleString('en')} rows already, the most it may`);
  // A cell takes the look its column has (the cell there already, or the one above), else its own.
  const put = (c: number, cell: Cell | null) => {
    const ref = refName(row, c);
    const there = cells[ref]?.s;
    const above = row - 1 > head ? cells[refName(row - 1, c)]?.s : undefined;
    const s: CellStyle | undefined = there ?? above ?? cell?.s;
    if (!cell) {
      if (!there) delete cells[ref];
      return;
    }
    cells[ref] = { ...cell, ...(s ? { s } : {}) };
    if (!s) delete cells[ref].s;
  };
  put(whenCol, { v: nowSerial(o.at), s: { fmt: 'datetime', code: 'yyyy-mm-dd hh:mm' } });
  for (const { f, c } of cols) put(c, fieldCell(f, o.value[f.id]));
  // The table's own columns with a formula in the row above carry it down.
  if (row - 1 > head)
    for (const c of headings.values()) {
      if (taken.has(c)) continue;
      const above = cells[refName(row - 1, c)];
      const here = cells[refName(row, c)];
      if (above?.f && !hasWords(here)) cells[refName(row, c)] = { ...here, f: shiftFormula(above.f, 1, 0), ...(above.s && !here?.s ? { s: above.s } : {}) };
    }
  // Charts that read the table down to its last row read the new one too.
  if (row - 1 > head) for (const s of b.sheets) for (const ch of s.charts ?? []) ch.range = grown(ch.range, s === sh, sh.name, row - 1) ?? ch.range;
  return { book: b, tab: sh.name, row: row + 1, added };
}

/** A chart's range with each part on `tab` that ended at row `end` (from 0) going one row further; null when none did. */
function grown(range: string, onTab: boolean, tab: string, end: number): string | null {
  const parts = chartParts(range);
  if (!parts) return null;
  let changed = false;
  const out = parts.map((p) => {
    const here = p.sheet === undefined ? onTab : p.sheet.toLowerCase() === tab.toLowerCase();
    if (here && p.x.r2 === end && p.x.r1 < end) {
      changed = true;
      p = { ...p, x: { ...p.x, r2: end + 1 } };
    }
    return `${p.sheet !== undefined ? `${quoteSheet(p.sheet)}!` : ''}${rangeName(p.x)}`;
  });
  return changed ? out.join(',') : null;
}

/** A new workbook for an agent's results: one tab, its heading row kept in view as it scrolls. */
export const resultsBook = (tab = RESULTS_TAB): Workbook => ({ v: 1, sheets: [{ id: newId(), name: cleanSheetName(tab), cells: {}, freeze: { rows: 1 } }] });
