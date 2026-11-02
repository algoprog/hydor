// Spreadsheets in Pages: a page of the kind "sheet" keeps its workbook (shared/sheets.ts) as text, a line per row
// of cells. Wherever a page's HTML is needed (the frame in the conversation, its own address, a published copy, its
// picture in Pages, a PDF), the workbook's own page is made from it: its sheets as tables with what their formulas
// give, to look through (tabs for the sheets), to print, or its top-left corner for the picture. It also becomes an
// Excel file (.xlsx, written here, its formulas kept and their results cached) or a CSV of a sheet, and comes in from
// CSV, TSV, Excel (.xlsx) and OpenDocument (.ods) files.
//
// save_sheet is how agents make and change spreadsheets; get_page gives one back as it is kept.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  bookOutline,
  bookText,
  cellsFromRows,
  colName,
  COL_W,
  computeBook,
  CellError,
  cleanStyle,
  fileFormula,
  fmtFromCode,
  FONT_PT,
  formatValue,
  formulaFromFile,
  formulaProblem,
  isError,
  replaceNames,
  normalizeBook,
  parseDate,
  parseDelimited,
  parseRef,
  refName,
  ROW_H,
  SHEET_LIMITS,
  shiftFormula,
  textOn,
  unpackC,
  unpackR,
  type Calc,
  type Cell,
  type CellStyle,
  type Scalar,
  type Sheet,
  type Workbook,
} from '../../shared/sheets.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { all, att, kid, kids, parseXml, patt, scan, textOf, type El } from '../documents/xml.ts';
import { resolvePart, Zip } from '../documents/zip.ts';
import { coreXml, esc as xesc, relsXml, XML_HEAD, zipParts } from './ooxml.ts';

export { isBookText } from '../../shared/sheets.ts';

/** The longest a workbook's kept text may be. */
export const MAX_BOOK = 4 * 1024 * 1024;

/** A workbook's text, read back; a broken one is an error a person can act on. */
export function readBook(text: string): Workbook {
  try {
    return normalizeBook(JSON.parse(text));
  } catch (e) {
    throw new HttpError(500, `This spreadsheet could not be read: ${(e as Error).message}`);
  }
}

/** The workbook as it is kept, checked (from the editor, or a person's new spreadsheet); refused rather than cut when it is over the limits. */
export function keepBook(input: unknown): { book: Workbook; text: string } {
  let book: Workbook;
  const notes: string[] = [];
  try {
    book = normalizeBook(input, { notes });
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (notes.length) throw new HttpError(413, `${notes.join(' ')} Make it smaller to save it.`);
  const text = bookText(book);
  if (Buffer.byteLength(text) > MAX_BOOK) throw new HttpError(413, `The spreadsheet is over ${MAX_BOOK / 1024 / 1024} MB as it is kept; make it smaller.`);
  return { book, text };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** A path an agent gave: from its session's folder, from home (~), or absolute. */
const fromSession = (cwd: string, p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : path.resolve(cwd || config.defaultCwd || os.homedir(), p));

const MAX_FILE = 64 * 1024 * 1024;

async function loadFile(p: string, cwd: string): Promise<{ book: Workbook; notes: string[]; name: string }> {
  const file = fromSession(cwd, p.trim());
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(file);
  } catch {
    throw new Error(`There is no file at ${file}.`);
  }
  if (!st.isFile()) throw new Error(`${file} is not a file.`);
  if (st.size > MAX_FILE) throw new Error(`${file} is over ${MAX_FILE / 1024 / 1024} MB.`);
  const got = importBook(await fs.promises.readFile(file), path.basename(file));
  return { ...got, name: path.basename(file) };
}

/** A sheet of a file's workbook: the one named (in any case), else the first. */
const sheetNamed = (b: Workbook, name: unknown) => (typeof name === 'string' && name.trim() ? b.sheets.find((s) => s.name.toLowerCase() === name.trim().toLowerCase()) : undefined) ?? b.sheets[0];

/**
 * A workbook from an agent (save_sheet, without its id and title): checked as keepBook does. A sheet may name a
 * file of the session to fill it from (file: "data.csv": CSV, TSV, XLSX or ODS; sheet: which of the file's), and
 * the workbook may come whole from one (file at the top). What was left out is said in `notes`, for the agent.
 */
export async function agentBook(input: unknown, cwd: string): Promise<{ book: Workbook; text: string; notes: string[] }> {
  const notes: string[] = [];
  let v: unknown = input;
  if (isObj(v)) {
    v = { ...v };
    const top = v as Obj;
    if (typeof top.file === 'string' && top.file.trim()) {
      const got = await loadFile(top.file, cwd);
      notes.push(...got.notes.map((n) => `${got.name}: ${n}`));
      const given = Array.isArray(top.sheets) ? (top.sheets as unknown[]) : [];
      // The file's sheets, each replaced by a given one of the same name; the other given sheets after them.
      const byName = new Map(given.filter(isObj).map((s) => [String(s.name ?? '').toLowerCase(), s] as const));
      const fromFile = got.book.sheets.map((s) => {
        const over = byName.get(s.name.toLowerCase());
        if (over) byName.delete(s.name.toLowerCase());
        return over ? { ...over, base: s } : s;
      });
      top.sheets = [...fromFile, ...given.filter((s) => !isObj(s) || [...byName.values()].includes(s))];
      delete top.file;
    }
    if (Array.isArray(top.sheets)) {
      const list: unknown[] = [];
      for (const s of top.sheets as unknown[]) {
        if (!isObj(s) || typeof s.file !== 'string' || !s.file.trim()) {
          list.push(s);
          continue;
        }
        const got = await loadFile(s.file, cwd);
        const picked = sheetNamed(got.book, s.sheet ?? s.fileSheet);
        notes.push(...got.notes.map((n) => `${got.name}: ${n}`));
        const { file: _f, sheet: _s, fileSheet: _fs, ...rest } = s;
        list.push({ ...rest, name: rest.name ?? (got.book.sheets.length > 1 ? picked.name : path.parse(got.name).name), base: picked });
      }
      top.sheets = list;
    }
  }
  let book: Workbook;
  try {
    book = normalizeBook(v, { notes });
  } catch (e) {
    throw new Error(`${(e as Error).message} See save_sheet's description for the workbook's shape.`);
  }
  const text = bookText(book);
  if (Buffer.byteLength(text) > MAX_BOOK) throw new Error(`The spreadsheet is over ${MAX_BOOK / 1024 / 1024} MB as it is kept; make it smaller (fewer cells, or shorter words).`);
  const bad = formulaIssues(book);
  if (bad.length) notes.push(`These formulas cannot be read and show #ERROR!: ${bad.join('; ')}.`);
  return { book, text, notes };
}

/** Formulas that cannot be read, with where they are (the first few). */
function formulaIssues(book: Workbook): string[] {
  const out: string[] = [];
  for (const sh of book.sheets)
    for (const [k, c] of Object.entries(sh.cells)) {
      if (c.f === undefined) continue;
      const why = formulaProblem(c.f);
      if (why) out.push(`${sh.name}!${k} (=${c.f.slice(0, 60)}): ${why}`);
      if (out.length >= 5) return out;
    }
  return out;
}

// ---- what agents are told ------------------------------------------------------------------------------------

const SHOW = 150_000;

/** What get_page tells an agent of a spreadsheet: an outline, what its formulas give, and the workbook as it is kept. */
export function bookForAgent(text: string): string {
  const book = readBook(text);
  const calc = computeBook(book);
  const n = book.sheets.length;
  let body = text;
  let cut = '';
  if (text.length > SHOW) {
    // Each sheet's first rows, as far as there is room.
    const per = Math.floor(SHOW / n);
    const lines = text.split('\n');
    const out: string[] = [];
    let used = 0;
    for (const line of lines) {
      if (/^ \{"id":/.test(line) || /^ \}\}/.test(line) || line === ']}' || line.startsWith('{"v":1')) {
        out.push(line);
        if (/^ \{"id":/.test(line)) used = 0;
        continue;
      }
      if (used > per) continue;
      out.push(line);
      used += line.length;
    }
    body = out.join('\n');
    cut = `\n(Cut: the spreadsheet is ${Math.round(text.length / 1024)} KB, so only each sheet's first rows are shown, and that text is not a whole workbook. To change cells not shown here, export it as an Excel file (export_page), change the file, and save it back with save_sheet { id, title, file: "<the .xlsx>" }.)`;
  }
  const results: string[] = [];
  const vals = calc.all();
  let size = 0;
  for (const sh of book.sheets)
    for (const [k, v] of Object.entries(vals[sh.id] ?? {})) {
      if (size > 20_000) break;
      const t = `${sh.name}!${k}=${formatValue(v, sh.cells[k]?.s)}`;
      results.push(t);
      size += t.length + 2;
    }
  return [
    `A spreadsheet (a workbook of ${n} sheet${n === 1 ? '' : 's'}).`,
    '',
    'Outline:',
    bookOutline(book, calc),
    ...(results.length ? ['', `What its formulas give${size > 20_000 ? ' (the first ones)' : ''}: ${results.join('; ')}`] : []),
    '',
    'The workbook as it is kept: each sheet with its id, name, cells by name (v: a value, f: a formula without "=", s: its style), cols and rows (widths and heights in px, by index from 0) and freeze. To change it, send the whole workbook back with save_sheet and this id, each sheet with its id; cells you leave out are emptied.',
    body + cut,
  ].join('\n');
}

const SHEET_HELP = [
  'Make or change a spreadsheet, kept in the user’s Library, where they edit it as in Excel or Google Sheets (formulas, formats, sorting, several sheets) and export it to Excel (.xlsx), CSV or PDF. Use it whenever the user wants a spreadsheet, a budget, a tracker, a schedule, an invoice, a plan or any table of numbers they will work with, rather than writing an .xlsx or .csv file (unless they ask for a file, or work on one they have). It shows in the conversation as a table.',
  'The workbook: { title, sheets: [{ name, rows: [[…], …] }] }. rows fill the sheet from A1 (or from start: "B2"), an array per row; a value is a number, words, true or false, null for an empty cell, or a formula: "=SUM(B2:B9)". Words are read as a person types them: "12%" is a percent, "$1,200" an amount, "2026-01-31" a date, "007" stays words; start with \' to keep words as they are. Cells by name, instead or as well: cells: { "B2": 12, "C2": "=B2*2", "D2": { "v": "Paid", "s": { "b": true } } } (as an object, v is taken as it is and f holds a formula, without "=").',
  'Formulas work as in Excel: + - * / ^ & = <> < > <= >=, 50%, references (A1, $A$1, A1:B5, A:A, Sheet2!A1, \'My sheet\'!A1:B2) and functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTBLANK, COUNTIF(S), SUMIF(S), AVERAGEIF(S), MAXIFS, MINIFS, SUMPRODUCT, PRODUCT, MEDIAN, STDEV, LARGE, SMALL, RANK, ROUND, ROUNDUP, ROUNDDOWN, INT, ABS, SQRT, POWER, MOD, IF, IFS, IFERROR, IFNA, AND, OR, NOT, SWITCH, CHOOSE, VLOOKUP, HLOOKUP, XLOOKUP, INDEX, MATCH, XMATCH, OFFSET, INDIRECT, CONCAT, TEXTJOIN, LEFT, RIGHT, MID, LEN, UPPER, LOWER, PROPER, TRIM, SUBSTITUTE, FIND, SEARCH, TEXT, VALUE, TODAY, NOW, DATE, YEAR, MONTH, DAY, WEEKDAY, EOMONTH, EDATE, DATEDIF, NETWORKDAYS, WORKDAY, PMT, FV, PV, NPER, RATE, NPV, IRR and more. Dates are Excel’s day numbers.',
  'How it looks: header: true makes the first row bold and keeps it in view as the sheet scrolls; formats per column: { "B": "currency", "C:D": "percent", "E": "date", "F": { "fmt": "number", "dp": 1 } } (general, number, percent, currency with cur: "€", date, text; dp: decimals); widths: { "A": 180 } in px (100 otherwise); heights: { "1": 32 } by row number; freeze: { rows: 1, cols: 1 }; styles over ranges: { "A10:D10": { "b": true, "fill": "#fff3cd" } }. A style: b, i, u, s (struck through), color and fill (#hex), align (left, center, right), valign (top, middle, bottom), wrap, fmt, dp, cur, size (pt).',
  'A sheet may come from a file of this session instead: file: "data.csv" (CSV, TSV, .xlsx or .ods; from the session’s folder, ~ or absolute; sheet: which of an Excel file’s sheets), with rows, cells and formats given too going on top. file beside title (no sheets) makes the whole workbook from an .xlsx or .ods file.',
  'At most 50 sheets, 200,000 cells, 20,000 rows and 500 columns a sheet. Good sheets have a header row, one kind of value per column, and totals as formulas (=SUM(B2:B20)) rather than typed numbers, so they stay right when the user changes one.',
  'To change a spreadsheet, get_page with its id gives it whole (each sheet with its id and cells, and what its formulas give); send the whole workbook back with the same id: a new version, the older ones restorable. Keep what the user changed.',
].join(' ');

export const SAVE_SHEET_DESCRIPTION = SHEET_HELP;

export const SAVE_SHEET_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved spreadsheet’s id, to save a new version of it.' },
    title: { type: 'string', description: 'Its name in the Library: "2027 budget".' },
    sheets: { type: 'array', items: { type: 'object' }, description: 'The sheets, in order: { name, rows, cells, header, formats, widths, heights, freeze, styles, file }.' },
    file: { type: 'string', description: 'Instead of sheets: an .xlsx, .ods or .csv file of this session to make the whole workbook from.' },
  },
  required: ['title'],
};

// ---- CSV -----------------------------------------------------------------------------------------------------------

/** A sheet as CSV (RFC 4180): what each cell shows, a UTF-8 mark first so Excel reads accents right. */
export function csvOfBook(book: Workbook, sheet = 0, calc: Calc = computeBook(book)): string {
  const si = book.sheets[sheet] ? sheet : 0;
  const sh = book.sheets[si];
  const e = calc.extent(si);
  const field = (s: string) => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [];
  for (let r = 0; r < e.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < e.cols; c++) {
      const cell = sh.cells[refName(r, c)];
      row.push(cell ? field(formatValue(calc.value(si, r, c), cell.s)) : '');
    }
    lines.push(row.join(','));
  }
  return `﻿${lines.join('\r\n')}${lines.length ? '\r\n' : ''}`;
}

// ---- Excel files: writing -----------------------------------------------------------------------------------------

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

/** A column's px as Excel's width (characters of its default font's digits, Calibri 11: 7 px each, 5 px of margin). */
const xlWidth = (px: number) => Math.round((Math.max(0, px - 5) / 7) * 256) / 256;
/** A row's px as points. */
const xlHeight = (px: number) => Math.round(px * 0.75 * 100) / 100;
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
const xnum = (n: number) => (Object.is(n, -0) ? '0' : String(n));
/** Excel knows only its own errors: a formula that needs itself is written as #REF!. */
const xlError = (e: CellError) => (e.code === '#CIRC!' ? '#REF!' : e.code === '#ERROR!' ? '#VALUE!' : e.code);

/** The number format for a cell's style and value: one of Excel's own (by id), or a code. */
function numFmtFor(s: CellStyle | undefined, v: Scalar): { id: number } | { code: string } {
  const dp = s?.dp;
  const decimals = (n: number) => (n > 0 ? `.${'0'.repeat(n)}` : '');
  switch (s?.fmt ?? 'general') {
    case 'number': {
      const d = dp ?? 2;
      return d === 0 ? { id: 3 } : d === 2 ? { id: 4 } : { code: `#,##0${decimals(d)}` };
    }
    case 'percent': {
      const d = dp ?? 0;
      return d === 0 ? { id: 9 } : d === 2 ? { id: 10 } : { code: `0${decimals(d)}%` };
    }
    case 'currency': {
      const cur = s?.cur ?? '$';
      const num = `#,##0${decimals(dp ?? 2)}`;
      return { code: /^[A-Za-z]/.test(cur) ? `${num} "${cur}"` : `"${cur}"${num}` };
    }
    case 'date':
      if (typeof v === 'number' && v > 0 && v < 1) return { code: 'hh:mm' };
      if (typeof v === 'number' && Math.abs(v - Math.round(v)) > 1 / 172800) return { code: 'yyyy-mm-dd hh:mm' };
      return { code: 'yyyy-mm-dd' };
    case 'text':
      return { id: 49 };
    default:
      return dp === undefined ? { id: 0 } : dp === 0 ? { id: 1 } : dp === 2 ? { id: 2 } : { code: `0${decimals(dp)}` };
  }
}

/** The styles a file's cells use: fonts, fills, number formats and their combinations (cellXfs), each written once. */
class XlStyles {
  fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
  fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  codes: string[] = [];
  xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private ix = new Map<string, number>();

  private once(list: string[], xml: string): number {
    const k = `${list === this.fonts ? 'f' : list === this.fills ? 'l' : 'c'}:${xml}`;
    let i = this.ix.get(k);
    if (i === undefined) {
      i = list.push(xml) - 1;
      this.ix.set(k, i);
    }
    return i;
  }

  /** The cellXfs index of a style for a value (0: none). */
  index(s: CellStyle | undefined, v: Scalar): number {
    const nf = numFmtFor(s, v);
    const numFmtId = 'id' in nf ? nf.id : 164 + this.once(this.codes, nf.code);
    let font = 0;
    if (s && (s.b || s.i || s.u || s.s || s.color || s.size)) {
      font = this.once(
        this.fonts,
        `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.s ? '<strike/>' : ''}${s.u ? '<u/>' : ''}<sz val="${s.size ?? 11}"/>${s.color ? `<color rgb="${argb(s.color)}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`,
      );
    }
    const fill = s?.fill ? this.once(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.fill)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const al = s && (s.align || s.valign || s.wrap) ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''}${s.valign ? ` vertical="${s.valign === 'middle' ? 'center' : s.valign}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
    if (!numFmtId && !font && !fill && !al) return 0;
    const xml = `<xf numFmtId="${numFmtId}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${al ? ` applyAlignment="1">${al}</xf>` : '/>'}`;
    return this.once(this.xfs, xml);
  }

  xml(): string {
    const codes = this.codes.length ? `<numFmts count="${this.codes.length}">${this.codes.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xesc(c)}"/>`).join('')}</numFmts>` : '';
    return (
      `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">${codes}` +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>'
    );
  }
}

/** The file's words, each kept once (sharedStrings.xml). */
class XlStrings {
  list: string[] = [];
  count = 0;
  private ix = new Map<string, number>();
  add(s: string): number {
    this.count++;
    let i = this.ix.get(s);
    if (i === undefined) {
      i = this.list.push(s) - 1;
      this.ix.set(s, i);
    }
    return i;
  }
  xml(): string {
    const si = this.list.map((s) => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${xesc(s)}</t></si>`).join('');
    return `${XML_HEAD}<sst xmlns="${NS_MAIN}" count="${this.count}" uniqueCount="${this.list.length}">${si}</sst>`;
  }
}

/** A sheet's part: its frozen panes, columns' widths, rows' heights and cells, each formula with what it gives. */
function sheetXml(sh: Sheet, si: number, calc: Calc, st: XlStyles, ss: XlStrings, names: Set<string>): string {
  const e = calc.extent(si);
  const rows = new Map<number, string[]>();
  for (const k of calc.keys(si)) {
    const r = unpackR(k);
    const c = unpackC(k);
    const ref = refName(r, c);
    const cell = sh.cells[ref];
    if (!cell) continue;
    let xml: string;
    if (cell.f !== undefined && !formulaProblem(cell.f)) {
      const v = calc.value(si, r, c);
      const s = st.index(cell.s, v);
      const a = `r="${ref}"${s ? ` s="${s}"` : ''}`;
      const f = `<f>${xesc(fileFormula(cell.f, names))}</f>`;
      if (typeof v === 'number') xml = `<c ${a}>${f}<v>${xnum(v)}</v></c>`;
      else if (typeof v === 'string') xml = `<c ${a} t="str">${f}<v>${xesc(v)}</v></c>`;
      else if (typeof v === 'boolean') xml = `<c ${a} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
      else if (v instanceof CellError) xml = `<c ${a} t="e">${f}<v>${xlError(v)}</v></c>`;
      else xml = `<c ${a}>${f}</c>`;
    } else {
      // A formula that cannot be read is kept as the words it is.
      const v = cell.f !== undefined ? `=${cell.f}` : cell.v;
      const s = st.index(cell.s, v ?? null);
      const a = `r="${ref}"${s ? ` s="${s}"` : ''}`;
      if (typeof v === 'number') xml = `<c ${a}><v>${xnum(v)}</v></c>`;
      else if (typeof v === 'string') xml = `<c ${a} t="s"><v>${ss.add(v)}</v></c>`;
      else if (typeof v === 'boolean') xml = `<c ${a} t="b"><v>${v ? 1 : 0}</v></c>`;
      else if (s) xml = `<c ${a}/>`;
      else continue;
    }
    let list = rows.get(r);
    if (!list) rows.set(r, (list = []));
    list.push(xml);
  }
  for (const k of Object.keys(sh.rows ?? {})) if (!rows.has(Number(k))) rows.set(Number(k), []);
  const body = [...rows.keys()]
    .sort((a, b) => a - b)
    .map((r) => {
      const h = sh.rows?.[r]?.h;
      const cells = rows.get(r)!;
      const attrs = `r="${r + 1}"${h ? ` ht="${xlHeight(h)}" customHeight="1"` : ''}`;
      return cells.length ? `<row ${attrs}>${cells.join('')}</row>` : `<row ${attrs}/>`;
    })
    .join('');
  const fr = sh.freeze?.rows ?? 0;
  const fc = sh.freeze?.cols ?? 0;
  let pane = '';
  if (fr || fc) {
    const top = refName(fr, fc);
    const which = fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight';
    pane = `<pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${top}" activePane="${which}" state="frozen"/><selection pane="${which}" activeCell="${top}" sqref="${top}"/>`;
  }
  const widths = Object.entries(sh.cols ?? {})
    .map(([k, v]) => [Number(k), v.w] as const)
    .filter(([, w]) => w)
    .sort((a, b) => a[0] - b[0]);
  const cols = widths.length ? `<cols>${widths.map(([c, w]) => `<col min="${c + 1}" max="${c + 1}" width="${xlWidth(w!)}" customWidth="1"/>`).join('')}</cols>` : '';
  const wide = Array.from({ length: e.cols }, (_, c) => sh.cols?.[c]?.w ?? COL_W).reduce((a, b) => a + b, 0) > 900;
  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
    `<dimension ref="${e.rows ? `A1:${refName(e.rows - 1, Math.max(0, e.cols - 1))}` : 'A1'}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${si === 0 ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultColWidth="${xlWidth(COL_W)}" defaultRowHeight="15"/>${cols}` +
    `<sheetData>${body}</sheetData>` +
    `<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${wide ? '<pageSetup orientation="landscape"/>' : ''}</worksheet>`
  );
}

/** The workbook as an Excel file (.xlsx) that opens in Excel, LibreOffice and Google Sheets: formulas kept, with what they give. */
export function xlsxOfBook(book: Workbook, title: string, calc: Calc = computeBook(book)): Buffer {
  const names = new Set(book.sheets.map((s) => s.name.toLowerCase()));
  const st = new XlStyles();
  const ss = new XlStrings();
  const sheets = book.sheets.map((sh, si) => sheetXml(sh, si, calc, st, ss, names));
  const n = sheets.length;
  const types =
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`).join('') +
    `<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CT}.sharedStrings+xml"/>` +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  const app =
    `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Naget Agent</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>` +
    `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${n}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
    `<TitlesOfParts><vt:vector size="${n}" baseType="lpstr">${book.sheets.map((s) => `<vt:lpstr>${xesc(s.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>` +
    '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>';
  const workbook =
    `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews>` +
    `<sheets>${book.sheets.map((s, i) => `<sheet name="${xesc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  const wbRels = relsXml([...sheets.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`] as [string, string, string]), [`rId${n + 1}`, 'styles', 'styles.xml'], [`rId${n + 2}`, 'sharedStrings', 'sharedStrings.xml']]);
  const rootRels = relsXml([
    ['rId1', 'officeDocument', 'xl/workbook.xml'],
    ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
    ['rId3', 'extended-properties', 'docProps/app.xml'],
  ]);
  return zipParts([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: coreXml(title) },
    { name: 'docProps/app.xml', data: app },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
    ...sheets.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x })),
    { name: 'xl/styles.xml', data: st.xml() },
    { name: 'xl/sharedStrings.xml', data: ss.xml() },
  ]);
}

// ---- files coming in ------------------------------------------------------------------------------------------------

/** A text file's words: UTF-8 (with its mark or without), UTF-16 with its mark, else Windows' Western encoding. */
export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8', 3);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2);
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const b = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1)));
    return b.swap16().toString('utf16le');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/**
 * A workbook from a file: CSV or TSV, Excel (.xlsx) or OpenDocument (.ods); and what was left out of it, in plain words.
 * For a file opened to be saved again (Files): `loses`, what of an Excel file the workbook cannot hold ("charts",
 * "merged", "formulas", "conditional", "validation", "comments", "pivots", "tables", "links"), and `cut`, whether
 * some of its cells or sheets did not come in at all.
 */
export function importBook(buf: Buffer, name: string): { book: Workbook; notes: string[]; loses?: string[]; cut?: boolean } {
  const ext = path.extname(name).slice(1).toLowerCase();
  const notes: string[] = [];
  if (buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) {
    const z = new Zip(buf, 400 * 1024 * 1024);
    const mime = z.text('mimetype', 200)?.trim() ?? '';
    if (mime.includes('opendocument.spreadsheet')) return readOds(z, notes);
    if (z.has('xl/workbook.xml') || /\.(xlsx|xlsm)$/i.test(name) || z.has('_rels/.rels')) return readXlsx(z, notes);
    throw new Error('This file is a zip, but not a spreadsheet (.xlsx or .ods).');
  }
  if (ext === 'xls' || (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0)) throw new Error('This is an old Excel file (.xls): save it as .xlsx or .csv first, then try again.');
  if (ext === 'numbers') throw new Error('This is a Numbers file: export it from Numbers as .xlsx or .csv first, then try again.');
  const text = decodeText(buf);
  if (text.slice(0, 8192).includes('\u0000')) throw new Error('This file is not a spreadsheet this can read: CSV, TSV, .xlsx or .ods.');
  const { rows, more, sep } = parseDelimited(text, ext === 'tsv' || ext === 'tab' ? '\t' : undefined);
  if (more) notes.push(`Only the first ${SHEET_LIMITS.rows.toLocaleString('en')} rows were taken in.`);
  // Files split by ; mostly come from where a comma marks decimals.
  const cells = cellsFromRows(rows, notes, sep === ';');
  const book = normalizeBook({ sheets: [{ name: path.parse(name).name || 'Sheet 1', base: { cells } }] }, { notes });
  // What delimited text loses is only ever what did not fit (rows, columns, cells past the limits).
  return { book, notes: [...new Set(notes)], loses: [], cut: more || notes.length > 0 };
}

/** A workbook from a file (see importBook), without the notes. */
export const bookFromFile = (buf: Buffer, name: string): Workbook => importBook(buf, name).book;

interface Rel {
  type: string;
  target: string;
}

/** A part's relationships, by id, their targets made paths in the package. */
function relsOf(z: Zip, part: string): Map<string, Rel> {
  const i = part.lastIndexOf('/');
  const file = part ? `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels` : '_rels/.rels';
  const out = new Map<string, Rel>();
  const xml = z.text(file);
  if (!xml) return out;
  for (const r of all(parseXml(xml).root, 'Relationship')) {
    const target = att(r, 'Target') ?? '';
    if (att(r, 'TargetMode') === 'External') continue;
    out.set(att(r, 'Id') ?? '', { type: att(r, 'Type') ?? '', target: target.startsWith('/') ? target.slice(1) : resolvePart(part || 'x', target) });
  }
  return out;
}

/** Excel's built-in number formats this reads (the others are General). */
const BUILTIN = new Map<number, string>([
  [1, '0'], [2, '0.00'], [3, '#,##0'], [4, '#,##0.00'], [5, '$#,##0'], [6, '$#,##0'], [7, '$#,##0.00'], [8, '$#,##0.00'], [9, '0%'], [10, '0.00%'],
  [14, 'yyyy-mm-dd'], [15, 'd-mmm-yy'], [16, 'd-mmm'], [17, 'mmm-yy'], [18, 'h:mm AM/PM'], [19, 'h:mm:ss AM/PM'], [20, 'h:mm'], [21, 'h:mm:ss'], [22, 'yyyy-mm-dd h:mm'],
  [37, '#,##0'], [38, '#,##0'], [39, '#,##0.00'], [40, '#,##0.00'], [45, 'mm:ss'], [46, '[h]:mm:ss'], [47, 'mm:ss.0'], [49, '@'],
]);

/** Excel's 64 colours by index, for files that name colours that way. */
const INDEXED = (
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
  '800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF ' +
  '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 ' +
  '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333'
).split(' ');

/** The theme's colours by Excel's index: background and text 1, background and text 2, accents 1 to 6, links. */
function themeColors(xml: string | null): string[] {
  if (!xml) return [];
  const scheme = all(parseXml(xml).root, 'clrScheme')[0];
  const list = kids(scheme).map((el) => {
    const c = kids(el)[0];
    const v = att(c, 'lastClr') ?? att(c, 'val') ?? '';
    return /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : '';
  });
  // The file lists dark 1, light 1, dark 2, light 2; its indexes start with the lights.
  return [list[1], list[0], list[3], list[2], ...list.slice(4)];
}

/** A colour lightened (tint > 0) or darkened (tint < 0) as Excel does it, through its lightness. */
function tinted(hex: string, tint: number): string {
  if (!tint) return hex;
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  const out = s === 0 ? [l, l, l] : [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  return `#${out.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** A colour element's colour (rgb, theme with its tint, or by index), or null. */
function colorOf(el: El | undefined, theme: string[]): string | null {
  if (!el || att(el, 'auto') === '1') return null;
  const rgb = att(el, 'rgb');
  let hex: string | null = null;
  if (rgb && /^[0-9a-f]{6,8}$/i.test(rgb)) {
    if (rgb.length === 8 && rgb.slice(0, 2) === '00' && rgb.slice(2).toLowerCase() !== '000000') return null;
    hex = `#${rgb.slice(-6).toLowerCase()}`;
  } else if (att(el, 'theme') !== undefined) hex = theme[Number(att(el, 'theme'))] || null;
  else if (att(el, 'indexed') !== undefined) {
    const v = INDEXED[Number(att(el, 'indexed'))];
    hex = v ? `#${v.toLowerCase()}` : null;
  }
  return hex ? tinted(hex, Number(att(el, 'tint') ?? 0) || 0) : null;
}

const on = (v: string | undefined) => v !== undefined && v !== '0' && v !== 'false';

/** Each cell style of an Excel file (by its index): how it looks in a workbook here, and whether it shows dates. */
function stylesOf(xml: string | null, theme: string[]): { s?: CellStyle; date: boolean }[] {
  if (!xml) return [];
  const root = parseXml(xml).root;
  const codes = new Map(BUILTIN);
  for (const nf of all(kid(root, 'numFmts'), 'numFmt')) codes.set(Number(att(nf, 'numFmtId')), att(nf, 'formatCode') ?? '');
  const fontEls = kids(kid(root, 'fonts'), 'font');
  const baseSize = Number(att(kid(fontEls[0], 'sz'), 'val') ?? 11);
  const baseColor = colorOf(kid(fontEls[0], 'color'), theme);
  const fonts = fontEls.map((f) => {
    const out: Obj = {};
    if (kid(f, 'b') && on(att(kid(f, 'b'), 'val') ?? '1')) out.b = true;
    if (kid(f, 'i') && on(att(kid(f, 'i'), 'val') ?? '1')) out.i = true;
    if (kid(f, 'u') && att(kid(f, 'u'), 'val') !== 'none') out.u = true;
    if (kid(f, 'strike') && on(att(kid(f, 'strike'), 'val') ?? '1')) out.s = true;
    const sz = Number(att(kid(f, 'sz'), 'val'));
    if (sz && Math.abs(sz - baseSize) > 0.01) out.size = Math.round(sz);
    const color = colorOf(kid(f, 'color'), theme);
    if (color && color !== baseColor && color !== '#000000') out.color = color;
    return out;
  });
  const fills = kids(kid(root, 'fills'), 'fill').map((f) => {
    const p = kid(f, 'patternFill');
    return att(p, 'patternType') === 'solid' ? colorOf(kid(p, 'fgColor'), theme) : null;
  });
  return kids(kid(root, 'cellXfs'), 'xf').map((xf) => {
    const fmt = fmtFromCode(codes.get(Number(att(xf, 'numFmtId') ?? 0)) ?? '');
    const raw: Obj = { ...(fonts[Number(att(xf, 'fontId') ?? 0)] ?? {}), ...fmt };
    const fill = fills[Number(att(xf, 'fillId') ?? 0)];
    if (fill) raw.fill = fill;
    const al = kid(xf, 'alignment');
    const h = att(al, 'horizontal');
    if (h === 'left' || h === 'right' || h === 'center') raw.align = h;
    else if (h === 'centerContinuous') raw.align = 'center';
    const v = att(al, 'vertical');
    if (v === 'top') raw.valign = 'top';
    else if (v === 'center') raw.valign = 'middle';
    if (on(att(al, 'wrapText'))) raw.wrap = true;
    return { s: cleanStyle(raw), date: fmt.fmt === 'date' };
  });
}

/** An Excel file's workbook: its sheets' cells (values, formulas, styles), widths, heights and frozen panes. */
function readXlsx(z: Zip, notes: string[]): { book: Workbook; notes: string[]; loses: string[]; cut: boolean } {
  const main = [...relsOf(z, '').values()].find((r) => r.type.endsWith('/officeDocument'))?.target ?? 'xl/workbook.xml';
  const wbXml = z.text(main);
  if (!wbXml) throw new Error('This Excel file has no workbook in it.');
  const wb = parseXml(wbXml).root;
  const rels = relsOf(z, main);
  const of = (type: string) => [...rels.values()].find((r) => r.type.endsWith(`/${type}`))?.target;
  const date1904 = on(att(kid(wb, 'workbookPr'), 'date1904'));
  const sst = z.text(of('sharedStrings') ?? 'xl/sharedStrings.xml');
  const shared = sst
    ? kids(parseXml(sst).root, 'si').map((si) => {
        let s = '';
        for (const x of si.c) if (typeof x !== 'string') s += x.n === 't' ? textOf(x) : x.n === 'r' ? textOf(kid(x, 't')) : '';
        return s;
      })
    : [];
  const styles = stylesOf(z.text(of('styles') ?? 'xl/styles.xml'), themeColors(z.text(of('theme') ?? 'xl/theme/theme1.xml')));
  // Names the workbook defines for cells or ranges (TaxRate: Sheet1!$B$1): formulas get the reference in their place.
  const names = new Map<string, string>();
  for (const d of all(kid(wb, 'definedNames'), 'definedName')) {
    const name = att(d, 'name') ?? '';
    const ref = textOf(d).trim();
    if (!name.startsWith('_xlnm.') && /^(?:'[^']+'|[A-Za-z_][\w.]*)!\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?$/.test(ref)) names.set(name.toLowerCase(), ref);
  }
  const sheets: Obj[] = [];
  const state = { cells: 0, drawn: false, merged: false, bad: false, cutRows: false, cutCells: false };
  // What a workbook here does not hold, for a file to be saved again: their keys (importBook says which).
  const loses = new Set<string>();
  let cutSheets = false;
  const listed = all(kid(wb, 'sheets'), 'sheet');
  for (const s of listed) {
    const name = att(s, 'name') ?? `Sheet ${sheets.length + 1}`;
    const rel = rels.get(patt(s, 'id') ?? '');
    if (!rel || !rel.type.endsWith('/worksheet')) {
      notes.push(`“${name}” is not a sheet of cells (a chart sheet, say): it was left out.`);
      loses.add('charts');
      continue;
    }
    const xml = z.text(rel.target, 96 * 1024 * 1024);
    if (!xml) continue;
    const parts = [...relsOf(z, rel.target).values()];
    if (parts.some((r) => /\/(drawing|chart)$/.test(r.type))) state.drawn = true;
    if (parts.some((r) => /\/(comments|threadedComment)$/.test(r.type))) loses.add('comments');
    if (parts.some((r) => /\/pivotTable$/.test(r.type))) loses.add('pivots');
    if (parts.some((r) => /\/table$/.test(r.type))) loses.add('tables');
    if (/<(?:\w+:)?conditionalFormatting[\s>]/.test(xml)) loses.add('conditional');
    if (/<(?:\w+:)?dataValidations?[\s>]/.test(xml)) loses.add('validation');
    sheets.push(readWorksheet(xml, name, shared, styles, date1904, state, names));
    if (sheets.length >= SHEET_LIMITS.sheets) {
      cutSheets = listed.indexOf(s) < listed.length - 1;
      break;
    }
  }
  if (!sheets.length) throw new Error('This Excel file has no sheets of cells in it.');
  if (state.drawn) notes.push('Charts and pictures were left out: a spreadsheet here holds cells.');
  if (state.merged) notes.push('Merged cells were split: each keeps its own value.');
  if (state.bad) notes.push('Some formulas could not be read here (links to other files, tables by name…): their last values were kept instead.');
  if (state.cutRows) notes.push(`Cells past row ${SHEET_LIMITS.rows.toLocaleString('en')} or column ${colName(SHEET_LIMITS.cols - 1)} were left out.`);
  if (state.cutCells) notes.push(`Only the first ${SHEET_LIMITS.cells.toLocaleString('en')} cells were taken in.`);
  if (cutSheets) notes.push(`Only the first ${SHEET_LIMITS.sheets} sheets were taken in.`);
  if (state.drawn) loses.add('charts');
  if (state.merged) loses.add('merged');
  if (state.bad) loses.add('formulas');
  if (z.names().some((n) => n.startsWith('xl/externalLinks/'))) loses.add('links');
  return { book: normalizeBook({ sheets }, { notes }), notes, loses: [...loses], cut: state.cutRows || state.cutCells || cutSheets };
}

/** One worksheet's XML, read as it streams by (a big sheet is never held as a tree). */
function readWorksheet(
  xml: string,
  name: string,
  shared: string[],
  styles: { s?: CellStyle; date: boolean }[],
  date1904: boolean,
  state: { cells: number; merged: boolean; bad: boolean; cutRows: boolean; cutCells: boolean },
  names: Map<string, string>,
): Obj {
  const cells: Record<string, Cell> = {};
  const cols: Record<number, { w: number }> = {};
  const rows: Record<number, { h: number }> = {};
  let freeze: { rows?: number; cols?: number } | undefined;
  const masters = new Map<string, { f: string; r: number; c: number }>();
  let cur: { r: number; c: number; s: number; t: string } | null = null;
  let row = -1;
  let col = -1;
  let where: 'v' | 'f' | 't' | null = null;
  let inIs = false;
  let phonetic = 0;
  let v = '';
  let f = '';
  let fa: Record<string, string> | null = null;
  let is = '';
  const finish = () => {
    const { r, c, s, t } = cur!;
    if (r >= SHEET_LIMITS.rows || c >= SHEET_LIMITS.cols) return void (state.cutRows = true);
    let formula: string | undefined;
    if (fa && fa.t === 'shared' && fa.si !== undefined) {
      if (f) masters.set(fa.si, { f, r, c });
      const m = masters.get(fa.si);
      if (m) formula = f || shiftFormula(m.f, r - m.r, c - m.c);
    } else if (fa && fa.t !== 'dataTable' && f) formula = f;
    const st = styles[s];
    let value: string | number | boolean | undefined;
    if (t === 's') value = shared[Number(v)] ?? '';
    else if (t === 'str') value = v;
    else if (t === 'inlineStr') value = is;
    else if (t === 'b') value = v === '1' || v === 'true';
    else if (t === 'e') value = v;
    else if (t === 'd') value = parseDate(v) ?? v;
    else if (v !== '') {
      const n = Number(v);
      value = Number.isFinite(n) ? (st?.date && date1904 ? n + 1462 : n) : v;
    }
    const cell: Cell = {};
    if (formula !== undefined) {
      const fx = replaceNames(formulaFromFile(formula), names);
      if (!formulaProblem(fx)) cell.f = fx;
      else {
        state.bad = true;
        if (value !== undefined && value !== '') cell.v = value;
      }
    } else if (value !== undefined && value !== '') cell.v = value;
    if (st?.s) cell.s = st.s;
    if (cell.v === undefined && cell.f === undefined && !cell.s) return;
    if (state.cells >= SHEET_LIMITS.cells) return void (state.cutCells = true);
    state.cells++;
    cells[refName(r, c)] = cell;
  };
  scan(xml, {
    open(n, a, self) {
      switch (n) {
        case 'row':
          row = a.r ? Number(a.r) - 1 : row + 1;
          col = -1;
          if (on(a.customHeight) && a.ht && row < SHEET_LIMITS.rows) rows[row] = { h: Math.round(Number(a.ht) / 0.75) };
          break;
        case 'c': {
          const p = a.r ? parseRef(a.r) : null;
          col = p ? p.c : col + 1;
          cur = { r: p ? p.r : Math.max(0, row), c: col, s: Number(a.s ?? 0) || 0, t: a.t ?? 'n' };
          [v, f, fa, is] = ['', '', null, ''];
          break;
        }
        case 'v':
          if (!self) where = 'v';
          break;
        case 'f':
          fa = a;
          if (!self) where = 'f';
          break;
        case 'is':
          inIs = true;
          break;
        case 't':
          if (inIs && !self) where = 't';
          break;
        case 'rPh':
          phonetic++;
          break;
        case 'col': {
          const min = Number(a.min);
          const max = Math.min(Number(a.max), SHEET_LIMITS.cols);
          if (on(a.customWidth) && a.width && max - min < 50) for (let k = min - 1; k < max; k++) cols[k] = { w: Math.round(Number(a.width) * 7 + 5) };
          break;
        }
        case 'pane':
          if (a.state === 'frozen' || a.state === 'frozenSplit') freeze = { rows: Number(a.ySplit ?? 0) || 0, cols: Number(a.xSplit ?? 0) || 0 };
          break;
        case 'mergeCell':
          state.merged = true;
          break;
      }
    },
    close(n) {
      if (n === 'v' || n === 'f' || n === 't') where = null;
      else if (n === 'is') inIs = false;
      else if (n === 'rPh') phonetic--;
      else if (n === 'c' && cur) {
        finish();
        cur = null;
      }
    },
    text(t) {
      if (!cur || !where || phonetic > 0) return;
      if (where === 'v') v += t;
      else if (where === 'f') f += t;
      else is += t;
    },
  });
  return { name, base: { cells, cols, rows }, ...(freeze ? { freeze } : {}) };
}

/** An OpenDocument cell's words: its paragraphs, spaces (text:s) and tabs kept. */
function odfText(el: El): string {
  let s = '';
  for (const x of el.c) {
    if (typeof x === 'string') s += x;
    else if (x.n === 's') s += ' '.repeat(Math.min(1000, Number(att(x, 'c') ?? 1) || 1));
    else if (x.n === 'tab') s += '\t';
    else if (x.n === 'line-break') s += '\n';
    else if (x.n !== 'annotation') s += odfText(x);
  }
  return s;
}

/** An OpenDocument formula as Excel writes one: "of:=SUM([.A1:.B2];[$Data.C3])" is "SUM(A1:B2,Data!C3)". */
function odfFormula(f: string): string {
  const body = f.replace(/^[a-z]+:/i, '').replace(/^=/, '');
  return body
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) => {
      if (i % 2) return part;
      return part
        .replace(/\[([^\]]+)\]/g, (_m, ref: string) => {
          let sheet = '';
          const cells = ref.split(':').map((p) => {
            const dot = p.lastIndexOf('.');
            const sh = p.slice(0, dot).replace(/^\$/, '');
            if (sh) sheet = sh.replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
            return p.slice(dot + 1);
          });
          return `${sheet ? `${quoteName(sheet)}!` : ''}${cells.join(':')}`;
        })
        .replace(/;/g, ',');
    })
    .join('');
}
const quoteName = (n: string) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);

const ODS_CUR: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹', CHF: 'CHF' };

/**
 * An OpenDocument file's cell styles, by name: their number formats (from its number styles, in either part),
 * type, colours, fill, alignment and wrapping.
 */
function odsStyles(content: El, styles: El | null): Map<string, CellStyle> {
  const formats = new Map<string, Obj>();
  // The file's own type size for cells: a cell of that size has none of its own here.
  const base = [...all(styles ?? undefined, 'style'), ...all(styles ?? undefined, 'default-style')].find((s) => att(s, 'family') === 'table-cell' && (att(s, 'name') === 'Default' || s.n === 'default-style'));
  const baseSize = Number(/^([\d.]+)pt$/.exec(att(kid(base, 'text-properties'), 'font-size') ?? '')?.[1] ?? FONT_PT);
  for (const root of [styles, content]) {
    if (!root) continue;
    for (const el of [...all(root, 'number-style'), ...all(root, 'percentage-style'), ...all(root, 'currency-style'), ...all(root, 'date-style'), ...all(root, 'time-style'), ...all(root, 'text-style')]) {
      const name = att(el, 'name');
      if (!name) continue;
      const num = kid(el, 'number');
      const dp = Number(att(num, 'decimal-places') ?? 0) || 0;
      const texts = kids(el, 'text').map((t) => textOf(t)).join('');
      const sign = /[$€£¥₹]/.exec(texts)?.[0] ?? textOf(kid(el, 'currency-symbol')).trim();
      if (el.n === 'percentage-style') formats.set(name, { fmt: 'percent', dp });
      else if (el.n === 'currency-style' || sign) formats.set(name, { fmt: 'currency', dp, cur: sign || '$' });
      else if (el.n === 'date-style' || el.n === 'time-style') formats.set(name, { fmt: 'date' });
      else if (el.n === 'text-style') formats.set(name, { fmt: 'text' });
      else if (num) formats.set(name, att(num, 'grouping') === 'true' ? { fmt: 'number', dp } : { dp });
    }
  }
  const out = new Map<string, CellStyle>();
  for (const st of all(content, 'style')) {
    if (att(st, 'family') !== 'table-cell') continue;
    const raw: Obj = { ...(formats.get(att(st, 'data-style-name') ?? '') ?? {}) };
    const tp = kid(st, 'text-properties');
    if (att(tp, 'font-weight') === 'bold') raw.b = true;
    if (att(tp, 'font-style') === 'italic') raw.i = true;
    if ((att(tp, 'text-underline-style') ?? 'none') !== 'none') raw.u = true;
    if ((att(tp, 'text-line-through-style') ?? 'none') !== 'none') raw.s = true;
    const color = att(tp, 'color');
    if (color && color.toLowerCase() !== '#000000') raw.color = color;
    const size = /^([\d.]+)pt$/.exec(att(tp, 'font-size') ?? '');
    if (size && Math.abs(Number(size[1]) - baseSize) > 0.01) raw.size = Math.round(Number(size[1]));
    const cp = kid(st, 'table-cell-properties');
    const bg = att(cp, 'background-color');
    if (bg && bg !== 'transparent') raw.fill = bg;
    if (att(cp, 'wrap-option') === 'wrap') raw.wrap = true;
    const va = att(cp, 'vertical-align');
    if (va === 'top' || va === 'middle') raw.valign = va;
    const al = att(kid(st, 'paragraph-properties'), 'text-align');
    if (al === 'center') raw.align = 'center';
    else if (al === 'end' || al === 'right') raw.align = 'right';
    else if (al === 'left') raw.align = 'left';
    const s = cleanStyle(raw);
    if (s) out.set(att(st, 'name') ?? '', s);
  }
  return out;
}

/** An OpenDocument spreadsheet's sheets: values, formulas (with their last values where they cannot be read here), formats. */
function readOds(z: Zip, notes: string[]): { book: Workbook; notes: string[] } {
  const xml = z.text('content.xml');
  if (!xml) throw new Error('This OpenDocument file has no content in it.');
  const { root, cut } = parseXml(xml, 3_000_000);
  if (cut) notes.push('The file is too big to read whole: only its first part was taken in.');
  const stylesXml = z.text('styles.xml');
  const looks = odsStyles(root, stylesXml ? parseXml(stylesXml).root : null);
  const sheets: Obj[] = [];
  let count = 0;
  let bad = false;
  const body = all(root, 'spreadsheet')[0] ?? root;
  for (const t of kids(body, 'table')) {
    const cells: Record<string, Cell> = {};
    // Each column's own style, for its cells that have none.
    const colStyle: (string | undefined)[] = [];
    for (const col of all(t, 'table-column')) {
      const n = Math.min(SHEET_LIMITS.cols, Math.max(1, Number(att(col, 'number-columns-repeated') ?? 1) || 1));
      for (let k = 0; k < n && colStyle.length < SHEET_LIMITS.cols; k++) colStyle.push(att(col, 'default-cell-style-name'));
    }
    const rowsOf = (el: El, out: El[] = []) => {
      for (const x of kids(el)) {
        if (x.n === 'table-row') out.push(x);
        else if (/^table-(row-group|header-rows|rows)$/.test(x.n)) rowsOf(x, out);
      }
      return out;
    };
    let r = 0;
    for (const row of rowsOf(t)) {
      const rep = Math.max(1, Number(att(row, 'number-rows-repeated') ?? 1) || 1);
      const list = kids(row).filter((x) => x.n === 'table-cell' || x.n === 'covered-table-cell');
      const filled = list.some((x) => att(x, 'value-type') || att(x, 'formula') || kids(x, 'p').length);
      if (!filled) {
        r += rep;
        continue;
      }
      for (let k = 0; k < Math.min(rep, 100) && r < SHEET_LIMITS.rows; k++, r++) {
        let c = 0;
        for (const x of list) {
          const crep = Math.max(1, Number(att(x, 'number-columns-repeated') ?? 1) || 1);
          const type = att(x, 'value-type');
          const formula = att(x, 'formula');
          const text = kids(x, 'p').map(odfText).join('\n');
          if (!type && !formula && !text) {
            c += crep;
            continue;
          }
          for (let j = 0; j < Math.min(crep, 100) && c < SHEET_LIMITS.cols; j++, c++) {
            if (count >= SHEET_LIMITS.cells) break;
            const cell: Cell = {};
            const look = looks.get(att(x, 'style-name') ?? att(row, 'default-cell-style-name') ?? colStyle[c] ?? '');
            const s: CellStyle = { ...(look ?? {}) };
            let value: string | number | boolean | undefined;
            if (type === 'float' || type === 'percentage' || type === 'currency') {
              value = Number(att(x, 'value'));
              if (type === 'percentage') s.fmt = 'percent';
              if (type === 'currency') {
                s.fmt = 'currency';
                const cur = ODS_CUR[att(x, 'currency') ?? 'USD'];
                if (cur && cur !== '$') s.cur = cur;
              }
            } else if (type === 'date') {
              value = parseDate((att(x, 'date-value') ?? '').replace(/(\.\d+)?Z?$/, '')) ?? text;
              s.fmt = 'date';
            } else if (type === 'time') {
              const m = /PT(\d+)H(\d+)M(\d+(?:\.\d+)?)S/.exec(att(x, 'time-value') ?? '');
              value = m ? (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) / 86400 : text;
              s.fmt = 'date';
            } else if (type === 'boolean') value = att(x, 'boolean-value') === 'true';
            else value = text;
            if (typeof value === 'number' && !Number.isFinite(value)) value = text;
            if (formula) {
              const fx = formulaFromFile(odfFormula(formula));
              if (!formulaProblem(fx)) cell.f = fx;
              else bad = true;
            }
            if (cell.f === undefined && value !== undefined && value !== '') cell.v = value;
            const st = cleanStyle(s);
            if (st) cell.s = st;
            if (cell.v === undefined && cell.f === undefined) continue;
            cells[refName(r, c)] = cell;
            count++;
          }
          c += Math.max(0, crep - 100);
        }
      }
      if (rep > 100) r += rep - 100;
    }
    sheets.push({ name: att(t, 'name') ?? `Sheet ${sheets.length + 1}`, base: { cells } });
  }
  if (!sheets.length) throw new Error('This OpenDocument file has no sheets in it.');
  if (bad) notes.push('Some formulas could not be read here: their last values were kept instead.');
  if (count >= SHEET_LIMITS.cells) notes.push(`Only the first ${SHEET_LIMITS.cells.toLocaleString('en')} cells were taken in.`);
  return { book: normalizeBook({ sheets }, { notes }), notes };
}

// ---- the workbook's own page ------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A page is a workbook's own by its marker. */
export const isBookPage = (html: string) => html.slice(0, 2000).includes('<meta name="generator" content="Naget Agent sheets">');

const FONT = 'var(--n-font,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif)';
const LINE = 'var(--n-line,#e2e0da)';
const SOFT = 'var(--n-soft,#f1efea)';
const MUTED = 'var(--n-muted,#6b665c)';
const BG = 'var(--n-bg,#ffffff)';
const HEAD_H = 22;
const NUM_W = 42;

const VIEW_CSS = [
  'html,body{margin:0;padding:0}',
  `body.nb-body{margin:0;padding:0;max-width:none;background:${BG};color:var(--n-fg,#1d1b17);font:13px/1.3 ${FONT};-webkit-text-size-adjust:100%}`,
  '.nb{display:flex;flex-direction:column}',
  '.nb-sheet[hidden]{display:none}',
  '.nb-scroll{overflow:auto;max-height:600px;overscroll-behavior:contain}',
  'body.nb-fill .nb{height:100vh;height:100dvh}',
  'body.nb-fill .nb-sheet:not([hidden]){flex:1;min-height:0;display:flex;flex-direction:column}',
  'body.nb-fill .nb-scroll{flex:1;max-height:none}',
  '.nb-t{border-collapse:separate;border-spacing:0;table-layout:fixed;min-width:100%}',
  `.nb-t td,.nb-t th{box-sizing:border-box;border:0;border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};padding:0 5px;overflow:hidden;white-space:nowrap;vertical-align:middle;background-clip:padding-box}`,
  `.nb-t th{position:sticky;background:${SOFT};color:${MUTED};font-weight:500;font-size:11px;text-align:center}`,
  `.nb-t thead th{top:0;z-index:4;height:${HEAD_H}px}`,
  '.nb-t tbody th{left:0;z-index:3}',
  '.nb-t thead th.nb-k{left:0;z-index:6}',
  `.nb-t td{background:${BG}}`,
  '.nb-t td.n{text-align:right;font-variant-numeric:tabular-nums}',
  '.nb-t td.b,.nb-t td.e{text-align:center}',
  '.nb-t td.e{color:var(--n-err,#c0392b)}',
  '.nb-t td.w{white-space:pre-wrap;overflow-wrap:anywhere}',
  '.nb-t .fz{position:sticky}',
  '.nb-t td.fz{z-index:2}',
  '.nb-t th.fz{z-index:5}',
  `.nb-tabs{display:flex;gap:2px;padding:4px 6px;border-top:1px solid ${LINE};overflow-x:auto;flex-shrink:0;background:${BG}}`,
  `.nb-tabs button{font:inherit;font-size:12.5px;border:0;background:transparent;color:${MUTED};padding:5px 12px;border-radius:7px;cursor:pointer;white-space:nowrap}`,
  '.nb-tabs button[aria-selected=true]{background:var(--n-accent-soft,rgba(128,90,0,.12));color:var(--n-accent,#805a00);font-weight:600}',
  `.nb-note{padding:6px 10px;color:${MUTED};font-size:12px}`,
  `.nb-empty{padding:28px 12px;color:${MUTED};text-align:center}`,
].join('');

const PRINT_CSS = [
  '@page{margin:12mm}',
  '@page land{size:landscape}',
  'html,body{margin:0;padding:0;background:#fff}',
  'body{color:#111;font:9.5pt/1.3 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}',
  '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.nb-sheet+.nb-sheet{break-before:page}',
  '.nb-land{page:land}',
  'h2{font-size:12pt;margin:0 0 6pt;font-weight:600}',
  '.nb-t{border-collapse:collapse;table-layout:fixed}',
  '.nb-t td{border:0.5pt solid #c9c6bf;padding:1pt 4pt;overflow:hidden;white-space:nowrap;vertical-align:middle}',
  '.nb-t thead td{border-bottom:1pt solid #8f8b82}',
  '.nb-t tr{break-inside:avoid}',
  '.nb-t td.n{text-align:right;font-variant-numeric:tabular-nums}',
  '.nb-t td.b,.nb-t td.e{text-align:center}',
  '.nb-t td.e{color:#c0392b}',
  '.nb-t td.w{white-space:pre-wrap;overflow-wrap:anywhere}',
  '.nb-note{color:#666;font-size:8.5pt;margin-top:4pt}',
].join('');

/** Styles of cells made into classes (s1, s2…), so a big sheet's page stays small. */
class CssClasses {
  private ix = new Map<string, string>();
  get(css: string): string {
    if (!css) return '';
    let k = this.ix.get(css);
    if (!k) this.ix.set(css, (k = `s${this.ix.size + 1}`));
    return k;
  }
  css(): string {
    return [...this.ix].map(([css, k]) => `.nb-t .${k}{${css}}`).join('');
  }
}

/** A cell's look as CSS (its colours, type, alignment), from its checked style only. */
function cellCss(s: CellStyle | undefined, pt = 1): string {
  if (!s) return '';
  const out: string[] = [];
  if (s.b) out.push('font-weight:700');
  if (s.i) out.push('font-style:italic');
  if (s.u || s.s) out.push(`text-decoration:${[s.u ? 'underline' : '', s.s ? 'line-through' : ''].filter(Boolean).join(' ')}`);
  if (s.fill) out.push(`background:${s.fill}`);
  const color = s.color ?? (s.fill ? textOn(s.fill) : undefined);
  if (color) out.push(`color:${color}`);
  if (s.align) out.push(`text-align:${s.align}`);
  if (s.valign) out.push(`vertical-align:${s.valign}`);
  if (s.size) out.push(`font-size:${Math.round(s.size * pt * 100) / 100}pt`);
  return out.join(';');
}

/** The header rows a printed sheet repeats on each page: its frozen rows, else a first row of words over the rest. */
function headerRows(sh: Sheet, si: number, calc: Calc): number {
  if (sh.freeze?.rows) return Math.min(sh.freeze.rows, 5);
  const e = calc.extent(si);
  if (e.rows < 3) return 0;
  let words = 0;
  for (let c = 0; c < e.cols; c++) {
    const v = calc.value(si, 0, c);
    if (v === null) continue;
    if (typeof v !== 'string') return 0;
    words++;
  }
  return words >= 2 ? 1 : 0;
}

interface TableOpts {
  rows: number;
  cols: number;
  /** Column letters and row numbers. */
  heads: boolean;
  /** Frozen rows and columns stay in view. */
  sticky: boolean;
  /** How much wider and taller than in the editor (the picture's corner). */
  k: number;
  /** Rows in a thead (repeated on each printed page). */
  thead: number;
}

/** A sheet as a table: its cells as they show, words running over empty neighbours as in a spreadsheet. */
function tableHtml(sh: Sheet, si: number, calc: Calc, o: TableOpts, cls: CssClasses): string {
  const w = (c: number) => Math.round((sh.cols?.[c]?.w ?? COL_W) * o.k);
  const h = (r: number) => Math.round((sh.rows?.[r]?.h ?? ROW_H) * o.k);
  const fr = o.sticky ? Math.min(sh.freeze?.rows ?? 0, o.rows) : 0;
  const fc = o.sticky ? Math.min(sh.freeze?.cols ?? 0, o.cols) : 0;
  const head = o.heads ? Math.round(HEAD_H * o.k) : 0;
  const numW = o.heads ? Math.round(NUM_W * o.k) : 0;
  const top: number[] = [];
  for (let r = 0, y = head; r < fr; r++) (top[r] = y), (y += h(r));
  const left: number[] = [];
  for (let c = 0, x = numW; c < fc; c++) (left[c] = x), (x += w(c));
  // As wide as its columns (wider when there is room: the last column takes it), never squeezed narrower.
  let total = numW;
  for (let c = 0; c < o.cols; c++) total += w(c);
  const out: string[] = [`<table class="nb-t" style="width:${total}px"><colgroup>${o.heads ? `<col style="width:${numW}px">` : ''}`];
  for (let c = 0; c < o.cols; c++) out.push(`<col style="width:${w(c)}px">`);
  // A last column takes what width is left, so the grid fills the page.
  out.push(o.heads ? '<col></colgroup>' : '</colgroup>');
  if (o.heads) {
    out.push(`<thead><tr><th class="nb-k"></th>`);
    for (let c = 0; c < o.cols; c++) out.push(c < fc ? `<th class="fz" style="left:${left[c]}px">${colName(c)}</th>` : `<th>${colName(c)}</th>`);
    out.push('<th></th></tr></thead>');
  }
  const body: string[] = [];
  const headRows: string[] = [];
  for (let r = 0; r < o.rows; r++) {
    const row: string[] = [`<tr style="height:${h(r)}px">`];
    const frozenRow = r < fr;
    if (o.heads) row.push(`<th${frozenRow ? ` class="fz" style="top:${top[r]}px"` : ''}>${r + 1}</th>`);
    for (let c = 0; c < o.cols; c++) {
      const cell = sh.cells[refName(r, c)];
      const sticky: string[] = [];
      if (frozenRow) sticky.push(`top:${top[r]}px`);
      if (c < fc) sticky.push(`left:${left[c]}px`);
      const classes: string[] = sticky.length ? ['fz'] : [];
      if (!cell || (cell.v === undefined && cell.f === undefined && !cell.s)) {
        row.push(sticky.length ? `<td class="fz" style="${sticky.join(';')}"></td>` : '<td></td>');
        continue;
      }
      const v = cell.v === undefined && cell.f === undefined ? null : calc.value(si, r, c);
      const text = formatValue(v, cell.s);
      if (isError(v)) classes.push('e');
      else if (typeof v === 'number') classes.push('n');
      else if (typeof v === 'boolean') classes.push('b');
      if (cell.s?.wrap) classes.push('w');
      const k = cls.get(cellCss(cell.s, o.k));
      if (k) classes.push(k);
      // Words run on over the empty cells to their right, as far as they need (not out of the frozen columns).
      let span = 1;
      if (typeof v === 'string' && !cell.s?.wrap && (cell.s?.align ?? 'left') === 'left' && !(c < fc)) {
        let room = w(c);
        const need = text.length * 7.2 * o.k * (cell.s?.size ? cell.s.size / 10 : 1) + 10;
        while (room < need && c + span < o.cols) {
          const next = sh.cells[refName(r, c + span)];
          if (next && (next.v !== undefined || next.f !== undefined || next.s?.fill)) break;
          room += w(c + span);
          span++;
        }
      }
      row.push(`<td${span > 1 ? ` colspan="${span}"` : ''}${classes.length ? ` class="${classes.join(' ')}"` : ''}${sticky.length ? ` style="${sticky.join(';')}"` : ''}>${esc(text)}</td>`);
      c += span - 1;
    }
    if (o.heads) row.push('<td></td>');
    row.push('</tr>');
    (r < o.thead ? headRows : body).push(row.join(''));
  }
  if (headRows.length) out.push(`<thead>${headRows.join('')}</thead>`);
  out.push(`<tbody>${body.join('')}</tbody></table>`);
  return out.join('');
}

const VIEW_ROWS = 2000;
const VIEW_COLS = 200;
const PRINT_ROWS = 10_000;

const TABS_JS =
  "(function(){var b=document.body;if((window.naget&&window.naget.fill)||window.parent===window)b.classList.add('nb-fill');" +
  "var t=document.querySelectorAll('.nb-tabs button'),s=document.querySelectorAll('.nb-sheet');" +
  "t.forEach(function(x){x.addEventListener('click',function(){var i=x.getAttribute('data-i');s.forEach(function(e){e.hidden=e.getAttribute('data-i')!==i});t.forEach(function(y){y.setAttribute('aria-selected',String(y===x))})})})})();";

/**
 * The workbook's own page, its cells as they show with what their formulas give: its sheets to look through, a tab
 * each (`viewer`); every sheet to print, its header row on each page (`print`); or the first sheet's top-left
 * corner, for its picture in Pages (`still`). Nothing is loaded from elsewhere, and every cell's words are escaped.
 */
export function bookPage(book: Workbook, title: string, mode: 'viewer' | 'print' | 'still' = 'viewer', calc: Calc = computeBook(book)): string {
  const cls = new CssClasses();
  const head = (css: string) =>
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="generator" content="Naget Agent sheets"><style>${css}`;
  if (mode === 'still') {
    const sh = book.sheets[0];
    const e = calc.extent(0);
    const k = 1.25;
    let cols = 0;
    for (let x = Math.round(NUM_W * k); x < 1280 && cols < SHEET_LIMITS.cols; cols++) x += Math.round((sh.cols?.[cols]?.w ?? COL_W) * k);
    let rows = 0;
    for (let y = Math.round(HEAD_H * k); y < 800 && rows < SHEET_LIMITS.rows; rows++) y += Math.round((sh.rows?.[rows]?.h ?? ROW_H) * k);
    const table = tableHtml(sh, 0, calc, { rows: Math.max(rows, 1), cols: Math.max(cols, Math.min(e.cols, 12)), heads: true, sticky: false, k, thead: 0 }, cls);
    const css = `${VIEW_CSS}body.nb-body{font-size:${13 * k}px;overflow:hidden;width:1280px;height:800px}.nb-t th{font-size:${11 * k}px}.nb-t thead th{height:${Math.round(HEAD_H * k)}px}${cls.css()}`;
    return `${head(css)}</style></head><body class="nb-body"><div class="nb">${table}</div></body></html>`;
  }
  if (mode === 'print') {
    const parts: string[] = [];
    book.sheets.forEach((sh, si) => {
      const e = calc.extent(si);
      if (!e.rows && book.sheets.length > 1) return;
      const rows = Math.min(e.rows, PRINT_ROWS);
      const width = Array.from({ length: e.cols }, (_, c) => sh.cols?.[c]?.w ?? COL_W).reduce((a, b) => a + b, 0);
      const land = width > 700;
      const fit = Math.min(1, (land ? 1030 : 700) / Math.max(1, width));
      const table = e.rows ? tableHtml(sh, si, calc, { rows, cols: e.cols, heads: false, sticky: false, k: 1, thead: headerRows(sh, si, calc) }, cls) : '<p class="nb-note">This sheet is empty.</p>';
      parts.push(
        `<section class="nb-sheet${land ? ' nb-land' : ''}"><h2>${esc(sh.name)}</h2><div${fit < 1 ? ` style="zoom:${fit.toFixed(3)}"` : ''}>${table}</div>${e.rows > rows ? `<p class="nb-note">The first ${rows.toLocaleString('en')} of ${e.rows.toLocaleString('en')} rows.</p>` : ''}</section>`,
      );
    });
    return `${head(PRINT_CSS + cls.css())}</style></head><body>${parts.join('')}</body></html>`;
  }
  const sections: string[] = [];
  book.sheets.forEach((sh, si) => {
    const e = calc.extent(si);
    const rows = Math.min(e.rows, VIEW_ROWS);
    const cols = Math.min(e.cols, VIEW_COLS);
    // At least a screen's worth of empty grid, so a short sheet still looks like one.
    const table = tableHtml(sh, si, calc, { rows: Math.max(rows, Math.min(VIEW_ROWS, 20)), cols: Math.max(cols, Math.min(VIEW_COLS, 6)), heads: true, sticky: true, k: 1, thead: 0 }, cls);
    const more = e.rows > rows || e.cols > cols ? `<div class="nb-note">Showing the first ${rows.toLocaleString('en')} rows and ${cols} columns of ${e.rows.toLocaleString('en')} × ${e.cols}. Open it in the Library to see it all.</div>` : '';
    sections.push(`<section class="nb-sheet" data-i="${si}"${si ? ' hidden' : ''}><div class="nb-scroll">${table}</div>${more}</section>`);
  });
  const tabs =
    book.sheets.length > 1
      ? `<nav class="nb-tabs" role="tablist">${book.sheets.map((sh, si) => `<button type="button" role="tab" data-i="${si}" aria-selected="${si === 0}">${esc(sh.name)}</button>`).join('')}</nav>`
      : '';
  return `${head(VIEW_CSS + cls.css())}</style></head><body class="n-page nb-body"><div class="nb">${sections.join('')}${tabs}</div><script>${TABS_JS}</script></body></html>`;
}
