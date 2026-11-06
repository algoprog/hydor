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
  accountingParts,
  bookOutline,
  bookText,
  borderOf,
  chartBox,
  chartParts,
  CELL_FONTS,
  codeColor,
  cellsFromRows,
  colName,
  COL_W,
  computeBook,
  CellError,
  excelFormula,
  cleanLink,
  cleanStyle,
  fileFormula,
  fmtCode,
  fmtFromCode,
  fontOf,
  FONT_PT,
  formatValue,
  formulaFromFile,
  keyOf,
  formulaProblem,
  isRangeName,
  isError,
  replaceNames,
  normalizeBook,
  parseDate,
  parseDelimited,
  pack,
  parseRange,
  parseRef,
  quoteSheet,
  rangeName,
  refName,
  ROW_H,
  SHEET_LIMITS,
  sheetSizes,
  shiftFormula,
  spills,
  textOn,
  unpackC,
  unpackR,
  type Calc,
  type Cell,
  type CellStyle,
  type CondRule,
  type Rect,
  type Scalar,
  type Sheet,
  type SheetChart,
  type SheetComment,
  type Validation,
  type Workbook,
} from '../../shared/sheets.ts';
import { authorForAgent, newCommentId } from '../../shared/comments.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { all, att, decode, kid, kids, parseXml, patt, scan, textOf, type El } from '../documents/xml.ts';
import { spansOf } from '../../shared/sheet-groups.ts';
import { resolvePart, Zip } from '../documents/zip.ts';
import { chartData, chartProblem, chartSvg } from '../../shared/sheet-chart.ts';
import { CondFormats, hiddenCols, hiddenRows, isTicked, listOptions, Merges, Rules } from '../../shared/sheet-rules.ts';
import { coreXml, esc as xesc, relsXml, XML_HEAD, zipParts } from './ooxml.ts';
import { chartXml, commentsXml, condXml, drawingXml, Dxfs, filterXml, isListColor, isListsSheet, listFromSheet, listsSheet, mergesXml, namedAuthors, personsXml, readCharts, readConditional, readDxfs, readFilter, readNotes, readPersons, readThreaded, readValidation, validationXml } from './sheet-parts.ts';
import { joinRects, odfFormula, odfText, odsCondStyles, odsConditional, odsNote, odsValidations } from './sheet-ods.ts';
import { officeFont } from './word-fonts.ts';
import { SHEET_EDITS_HELP } from '../../shared/sheet-edits.ts';

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
export async function agentBook(input: unknown, cwd: string, prev?: Workbook): Promise<{ book: Workbook; text: string; notes: string[] }> {
  const notes: string[] = [];
  let v: unknown = input;
  // Comments are the user's and agents' threads: they come from the version this changes (and from files), never as an
  // agent sends them back; an agent answers, resolves or adds them with `comments`, a list of changes.
  let ops: unknown;
  if (isObj(v)) {
    v = { ...v };
    const top = v as Obj;
    ops = top.comments;
    delete top.comments;
    if (Array.isArray(top.sheets)) top.sheets = (top.sheets as unknown[]).map((x) => (isObj(x) && 'comments' in x ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'comments')) : x));
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
  for (const sh of book.sheets) {
    const was = prev?.sheets.find((x) => x.id === sh.id) ?? prev?.sheets.find((x) => x.name.toLowerCase() === sh.name.toLowerCase());
    if (was?.comments?.length) sh.comments = was.comments;
  }
  // The AI function's answers come from the version this changes (an agent never writes them); its named ranges too,
  // unless the agent sends names of its own.
  if (prev?.ai) book.ai = prev.ai;
  else delete book.ai;
  if (prev?.names?.length && !(isObj(v) && (v as Obj).names !== undefined)) book.names = prev.names;
  const waiting = aiWaiting(book);
  if (waiting) notes.push(`${waiting} AI cell${waiting === 1 ? ' waits' : 's wait'} for an answer: page_action ask_ai asks the helper model for them now, or the user does with Ask now in the editor.`);
  commentOps(book, ops, notes);
  const bad = formulaIssues(book);
  if (bad.length) notes.push(`These formulas cannot be read and show #ERROR!: ${bad.join('; ')}.`);
  // A chart whose range it cannot draw from is kept, and says why in its place: the agent hears it too.
  for (const sh of book.sheets)
    for (const ch of sh.charts ?? []) {
      const why = chartProblem(book, ch);
      if (why) notes.push(`The chart${ch.title ? ` “${ch.title}”` : ''} on “${sh.name}” cannot draw from ${ch.range}: ${why}`);
    }
  const text = bookText(book);
  if (Buffer.byteLength(text) > MAX_BOOK) throw new Error(`The spreadsheet is over ${MAX_BOOK / 1024 / 1024} MB as it is kept; make it smaller (fewer cells, or shorter words).`);
  return { book, text, notes };
}

/**
 * An agent's changes to comments (save_sheet's comments): {id, reply} answers one, {id, resolve: true} or {id, reopen:
 * true} resolves or reopens it, {id, delete: true} takes it out, {cell, text} (sheet: which, the first unless said)
 * adds one of the agent's on a cell, a reply where the cell has one already. What it could not do is said in `notes`.
 */
function commentOps(book: Workbook, ops: unknown, notes: string[]) {
  if (ops === undefined || ops === null) return;
  if (!Array.isArray(ops)) return void notes.push('comments must be a list of changes, such as [{"id": "c1", "reply": "…"}]: they were left as they were.');
  const now = Date.now();
  const find = (id: string) => {
    for (const sh of book.sheets) for (const c of sh.comments ?? []) if (c.id === id) return { sh, c };
    return null;
  };
  const clean = (x: unknown) => (typeof x === 'string' ? x.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 4000) : '');
  for (const raw of ops.slice(0, 500)) {
    const op = isObj(raw) ? raw : {};
    const id = typeof op.id === 'string' ? op.id.trim() : '';
    const reply = (c: SheetComment, t: string) => (c.replies = [...(c.replies ?? []), { id: `${c.id}r${(c.replies?.length ?? 0) + 1}${now.toString(36).slice(-3)}`, by: 'agent' as const, text: t, at: now }].slice(-50));
    const got = id ? find(id) : null;
    if (got) {
      const { sh, c } = got;
      if (op.delete === true) {
        sh.comments = sh.comments!.filter((x) => x !== c);
        if (!sh.comments.length) delete sh.comments;
        continue;
      }
      if (clean(op.reply)) reply(c, clean(op.reply));
      if (op.resolve === true || op.resolved === true) c.resolved = true;
      if (op.reopen === true || op.resolved === false) delete c.resolved;
      if (!clean(op.reply) && op.resolve === undefined && op.resolved === undefined && op.reopen === undefined && clean(op.text)) notes.push(`Comment ${id} is there already: answer it with "reply", not "text".`);
      continue;
    }
    if (id && (op.delete === true || clean(op.reply) || op.resolve !== undefined || op.reopen !== undefined)) {
      notes.push(`There is no comment ${id} to change: get_page lists them.`);
      continue;
    }
    const words = clean(op.text);
    const p = typeof op.cell === 'string' ? parseRef(op.cell.replace(/\$/g, '').trim().toUpperCase()) : null;
    const sh = typeof op.sheet === 'string' ? book.sheets.find((x) => x.name.toLowerCase() === String(op.sheet).trim().toLowerCase()) : book.sheets[0];
    if (!words) continue;
    if (!p || !sh || p.r >= SHEET_LIMITS.rows || p.c >= SHEET_LIMITS.cols) {
      notes.push(`A comment needs a cell (and a sheet that is there): "${words.slice(0, 40)}" was not added.`);
      continue;
    }
    const cell = refName(p.r, p.c);
    const had = sh.comments?.find((c) => c.cell === cell);
    if (had) {
      reply(had, words);
      delete had.resolved;
      notes.push(`${sh.name}!${cell} has a comment already (${had.id}): yours was added to it as a reply.`);
      continue;
    }
    const nid = /^[A-Za-z0-9_-]{1,40}$/.test(id) && !find(id) ? id : newCommentId();
    sh.comments = [...(sh.comments ?? []), { id: nid, by: 'agent' as const, text: words, at: now, cell }].sort((a, b) => keyOf(a.cell) - keyOf(b.cell));
  }
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
  // Without the AI function's answers (the cells show them).
  let body = book.ai ? bookText({ ...book, ai: undefined }) : text;
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
    ...commentsForAgent(book),
    ...(book.names?.length ? ['', `Named ranges: ${book.names.map((nm) => `${nm.name} = ${nm.ref}${nm.sheet ? ` (for “${book.sheets.find((s) => s.id === nm.sheet)?.name ?? '?'}” only)` : ''}`).join('; ')}`] : []),
    ...(() => {
      const waiting = calc.aiAsks().length;
      return waiting ? ['', `${waiting} AI cell${waiting === 1 ? ' waits' : 's wait'} for an answer (they show #BUSY!): page_action ask_ai asks the helper model for them.`] : [];
    })(),
    ...(() => {
      // Charts that cannot draw from their ranges, and why (each is kept, saying so in its place).
      const why = book.sheets.flatMap((sh) => (sh.charts ?? []).flatMap((ch) => (chartProblem(book, ch) ? [`“${sh.name}” ${ch.range}: ${chartProblem(book, ch)}`] : [])));
      return why.length ? ['', `Charts that cannot draw: ${why.join('; ')}`] : [];
    })(),
    '',
    'The workbook as it is kept: each sheet with its id, name, cells by name (v: a value, f: a formula without "=", s: its style, note: its note), cols and rows (widths and heights in px, hidden, by index from 0), freeze, merges, filter, conditional (formatting), validation (what cells take: lists, checkboxes, ratings…), charts (each with from and to: the cells its corners are on, and dx and dy, px into them) and board (its Kanban board: the table’s first cell, the column it groups by and those its cards show, by letter, its lanes’ order, whether the sheet opens on it). To change it, send the whole workbook back with save_sheet and this id, each sheet with its id and the parts you keep (cells you leave out are emptied), or only the cells that change with update (the rest stays).',
    body + cut,
  ].join('\n');
}

const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace('T', ' ');

/** How many of a workbook's AI cells wait for an answer. */
export function aiWaiting(book: Workbook): number {
  if (!book.sheets.some((sh) => Object.values(sh.cells).some((c) => c.f !== undefined && /(^|[^A-Za-z0-9_.])AI\s*\(/i.test(c.f)))) return 0;
  const calc = computeBook(book);
  calc.all();
  return calc.aiAsks().length;
}

/** The comments' threads, by sheet and cell, and how to answer them. */
function commentsForAgent(book: Workbook): string[] {
  const list = book.sheets.flatMap((sh) => (sh.comments ?? []).map((c) => ({ sh, c })));
  if (!list.length) return [];
  const open = list.filter((x) => !x.c.resolved).length;
  const who = (x: Parameters<typeof authorForAgent>[0]) => authorForAgent(x);
  return [
    '',
    `Comments (${open} open, ${list.length - open} resolved), each on a cell:`,
    ...list.flatMap(({ sh, c }) => [
      `- ${c.id} · ${c.resolved ? 'resolved' : 'open'} · ${quoteSheet(sh.name)}!${c.cell} · ${who(c)}, ${when(c.at)} UTC: ${c.text.replace(/\n/g, ' / ')}`,
      ...(c.replies ?? []).map((r) => `    ↳ ${who(r)}, ${when(r.at)} UTC: ${r.text.replace(/\n/g, ' / ')}`),
    ]),
    '',
    'To answer them, save_sheet with this id and comments: [{"id": "<id>", "reply": "what you did or say"}], adding "resolve": true once a comment is dealt with (or "reopen": true). Make the change a comment asks for in the cells too. Add a comment of your own with {"sheet": "<its name>", "cell": "B3", "text": "…"}. The comments in the sheets you send back are left as they are.',
  ];
}

const SHEET_HELP = [
  'Make or change a spreadsheet, kept in the user’s Library, where they edit it as in Excel or Google Sheets (formulas, formats, sorting, several sheets) and export it to Excel (.xlsx), CSV or PDF. Use it whenever the user wants a spreadsheet, a budget, a tracker, a schedule, an invoice, a plan or any table of numbers they will work with, rather than writing an .xlsx or .csv file (unless they ask for a file, or work on one they have). It shows in the conversation as a table.',
  'The workbook: { title, sheets: [{ name, rows: [[…], …] }] }. rows fill the sheet from A1 (or from start: "B2"), an array per row; a value is a number, words, true or false, null for an empty cell, or a formula: "=SUM(B2:B9)". Words are read as a person types them: "12%" is a percent, "$1,200" an amount, "2026-01-31" a date, "007" stays words; start with \' to keep words as they are. Cells by name, instead or as well: cells: { "B2": 12, "C2": "=B2*2", "D2": { "v": "Paid", "s": { "b": true } } } (as an object, v is taken as it is and f holds a formula, without "=").',
  "Formulas work as in Excel: + - * / ^ & = <> < > <= >=, 50%, references (A1, $A$1, A1:B5, A:A, Sheet2!A1, 'My sheet'!A1:B2) and functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTBLANK, COUNTIF(S), SUMIF(S), AVERAGEIF(S), MAXIFS, MINIFS, SUMPRODUCT, PRODUCT, MEDIAN, STDEV, LARGE, SMALL, RANK, ROUND, ROUNDUP, ROUNDDOWN, INT, ABS, SQRT, POWER, MOD, IF, IFS, IFERROR, IFNA, AND, OR, NOT, SWITCH, CHOOSE, VLOOKUP, HLOOKUP, XLOOKUP, INDEX, MATCH, XMATCH, OFFSET, INDIRECT, CONCAT, TEXTJOIN, LEFT, RIGHT, MID, LEN, UPPER, LOWER, PROPER, TRIM, SUBSTITUTE, FIND, SEARCH, TEXT, VALUE, TODAY, NOW, DATE, YEAR, MONTH, DAY, WEEKDAY, EOMONTH, EDATE, DATEDIF, NETWORKDAYS, WORKDAY, PMT, FV, PV, NPER, RATE, NPV, IRR and more. Dates are Excel’s day numbers. FILTER, SORT, SORTBY, UNIQUE and SEQUENCE spill their results into the cells below and beside them, which must be empty (else #SPILL!). So do the newer ones: LET, LAMBDA (with MAP, REDUCE, SCAN, BYROW, BYCOL, MAKEARRAY; =LAMBDA(x, x*2)(A1) calls one), VSTACK, HSTACK, TAKE, DROP, CHOOSECOLS, CHOOSEROWS, TOCOL, TOROW, WRAPROWS, WRAPCOLS, EXPAND, TRANSPOSE, TEXTSPLIT, TEXTBEFORE, TEXTAFTER, REGEXTEST, REGEXEXTRACT, REGEXREPLACE, Google Sheets’ REGEXMATCH, SPLIT, JOIN and ARRAYFORMULA (ARRAYFORMULA(LEFT(A2:A9, 3)) works LEFT on each), TREND, LINEST, FORECAST, CORREL, SLOPE, PERCENTILE.EXC, RANK.AVG, STDEVA and the other statistics, NETWORKDAYS.INTL and WORKDAY.INTL. HYPERLINK(url, label) is a link, IMAGE(url, alt) a picture in the cell, SPARKLINE(B2:M2, {\"charttype\",\"column\"}) a small chart in it (line, column, bar or winloss). =AI(\"Which country is this city in?\", A2) puts the helper model’s answer in the cell, as Google Sheets’ AI function does: worked out once and kept with the sheet, asked again only when its prompt or cells change; cells you write wait for page_action ask_ai (or the user’s Ask now), as asking costs a little.",
  'How it looks: header: true makes the first row bold and keeps it in view as the sheet scrolls; formats per column: { "B": "currency", "C:D": "percent", "E": "date", "F": { "fmt": "number", "dp": 1 }, "G": "dd/mm/yyyy" } (general, number, percent, currency with cur: "€", accounting, scientific, date, time, datetime, duration, text, or an Excel code: "#,##0.0;[Red]-#,##0.0", "d mmm yyyy", "h:mm AM/PM"; dp: decimals); widths: { "A": 180 } in px (100 otherwise); heights: { "1": 32 } by row number; freeze: { rows: 1, cols: 1 }; styles over ranges: { "A10:D10": { "b": true, "fill": "#fff3cd", "border": "thin" }, "A1:D10": { "outline": "medium" } } (outline: a border round the range). A style: b, i, u, s (struck through), color and fill (#hex), align (left, center, right), valign (top, middle, bottom), wrap, fmt, dp, cur, size (pt), font (Arial, Calibri, Cambria, Courier New, Georgia, Times New Roman, Trebuchet MS, Verdana), rot (degrees, -90 to 90), border on all four sides or bt, br, bb, bl for one ("thin", "medium", "thick", "dashed", "dotted" or "double", a colour after it: "thin #999999").',
  'Named ranges, beside sheets: names: [{ name: "TaxRate", ref: "Budget!$B$1" }, { name: "Sales", ref: "Budget!$C$2:$C$40" }, { name: "Net", ref: "LAMBDA(x, x/1.2)" }] (a range, a value or a LAMBDA, used in formulas by its name, =C2*TaxRate, =SUM(Sales), =Net(B2); sheet: a sheet’s name, for that sheet only); they follow their cells as rows, columns and sheets change, and stay as they are when you leave names out. A cell’s link: { "v": "Our site", "link": "https://example.com" } (or "#Sheet2!A1", a place in the workbook). noGrid: true hides a sheet’s grid lines.',
  'More a sheet may have: merges: ["A1:D1"] (cells merged into one; its first cell holds what it shows); hidden: { rows: [5, "8:9"], cols: ["C"] }; notes: { "B2": "Checked by Sam" } (or note on a cell object); filter: { range: "A1:D40", cols: { "C": { when: { op: "gt", a: "100" } }, "D": { hide: ["Done"] } } } (buttons on the header row; the rows it hides are hidden, not removed, and formulas still count them); conditional: [{ range: "C2:C40", when: { op: "gt", a: "100" }, style: { fill: "#fce8e6", color: "#c5221f", b: true } }, { range: "D2:D40", scale: ["#f8696b", "#ffeb84", "#63be7b"] }, { range: "E2:E40", bar: "#638ec6" }] (a condition’s op: empty, notEmpty, contains, notContains, starts, ends, is, eq, neq, gt, gte, lt, lte, between and notBetween with a and b, dateIs, before and after with a date or today, tomorrow, yesterday, week, month, year, formula with a: "=$C2>100" written for the range’s first cell; for conditional formatting also dup, unique, top and bottom with a: how many (b: "%" for a share), above and below the average; rules in order, the first that holds gives its look); validation: [{ range: "D2:D40", list: ["Open", { "v": "Done", "color": "#d9ead3" }] }, { range: "E2:E40", checkbox: true }, { range: "F2:F40", rating: 5 }, { range: "G2:G40", type: "number", when: { op: "between", a: "0", b: "100" }, reject: true }, { range: "H2:H40", source: "Lists!A1:A9" }] (lists show coloured chips and a dropdown, checkboxes hold TRUE or FALSE, ratings 0 to 5 stars; type also date, length and formula; reject refuses other input, else it is kept with a warning); charts: [{ kind: "line", range: "A1:C13", title: "Sales", at: "E2:J16" }] (kind: column, bar, line, area, pie, doughnut or scatter; range: the cells it draws, or several ranges split by commas read as if side by side, each as long as the others: "A1:A13,D1:D13" takes the labels from A and the values from D; series down the columns, or by: "rows"; the first column as labels and the first row as names when they hold words, or labels and names: true or false; legend: bottom, right, top or none; xTitle, yTitle, colors, stacked; where it sits: at: "E2:J16", the cells it covers, or at: "E2" with w and h in px; it is kept as from and to, the cells its corners are on, so it moves and stretches with them as rows and columns go in or out; a range it cannot draw from is kept and says why); board: { by: "Status", fields: ["Owner", "Hours"], lanes: ["Open", "Doing", "Done"], open: true } (the table’s rows as a Kanban board, as the user sees them in View → Kanban board: by, the column it groups by, a dropdown column; fields, the columns its cards show under their first cell; lanes, the options’ order; open: the sheet opens on it; columns by their header’s words or their letters; at: the table’s first cell, A1 unless said).',
  'Comments: the user’s and agents’ threads on cells (beside notes), which get_page lists with their ids. Answer them with comments at the top: [{ "id": "c1", "reply": "Done: the totals are formulas now", "resolve": true }] (reply, resolve or reopen, delete), and add one of your own with { "sheet": "Budget", "cell": "B3", "text": "Is this the right rate?" }; comments inside the sheets you send are left as they were.',
  'A sheet may come from a file of this session instead: file: "data.csv" (CSV, TSV, .xlsx or .ods; from the session’s folder, ~ or absolute; sheet: which of an Excel file’s sheets), with rows, cells and formats given too going on top. file beside title (no sheets) makes the whole workbook from an .xlsx or .ods file.',
  'At most 50 sheets, 200,000 cells, 20,000 rows and 500 columns a sheet. Good sheets have a header row, one kind of value per column, and totals as formulas (=SUM(B2:B20)) rather than typed numbers, so they stay right when the user changes one.',
  'To change a spreadsheet, get_page with its id gives it whole (each sheet with its id and cells, and what its formulas give); send the whole workbook back with the same id, or only the cells that change with update: a new version, the older ones restorable. Keep what the user changed.',
  SHEET_EDITS_HELP,
  'page_action does what the editor’s Data, Edit and sheet tabs’ menus do, without writing the cells yourself: sort (rows move whole, with their formulas and comments), remove_duplicates, fill, clear, trim_spaces, split_text, summarize, insert_rows, insert_columns, delete_rows, delete_columns (every formula that points there follows), rename_sheet (formulas that name it follow), duplicate_sheet, delete_sheet, move_sheet.',
].join(' ');

export const SAVE_SHEET_DESCRIPTION = SHEET_HELP;

export const SAVE_SHEET_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved spreadsheet’s id, to save a new version of it.' },
    title: { type: 'string', description: 'Its name in the Library: "2027 budget".' },
    sheets: { type: 'array', items: { type: 'object' }, description: 'The sheets, in order: { name, rows, cells, header, formats, widths, heights, freeze, styles, merges, hidden, notes, filter, conditional, validation, charts, board, file }.' },
    file: { type: 'string', description: 'Instead of sheets: an .xlsx, .ods or .csv file of this session to make the whole workbook from.' },
    update: {
      type: 'array',
      items: { type: 'object' },
      description: 'With id, instead of sheets: changes on top of the sheets they name, each {"sheet": its name or id (the first when left out), "cells": {"B7": 1250}, or "rows" from "start", and any other field of a sheet}; a value null empties a cell.',
    },
    comments: { type: 'array', items: { type: 'object' }, description: 'Changes to its comments: { id, reply, resolve, reopen, delete } for one get_page lists, { sheet, cell, text } for a new one of yours.' },
  },
  required: ['title'],
};

// ---- CSV -----------------------------------------------------------------------------------------------------------

/** A sheet as CSV (RFC 4180): what each cell shows, a UTF-8 mark first so Excel reads accents right. */
export function csvOfBook(book: Workbook, sheet = 0, calc: Calc = computeBook(book)): string {
  const si = book.sheets[sheet] ? sheet : 0;
  const sh = book.sheets[si];
  const e = calc.shownExtent(si);
  const field = (s: string) => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [];
  for (let r = 0; r < e.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < e.cols; c++) {
      const cell = sh.cells[refName(r, c)];
      // A cell's value, or what a formula spilled into it.
      const v = calc.value(si, r, c);
      row.push(cell || v !== null ? field(formatValue(v, cell?.s)) : '');
    }
    lines.push(row.join(','));
  }
  return `﻿${lines.join('\r\n')}${lines.length ? '\r\n' : ''}`;
}

// ---- Excel files: writing -----------------------------------------------------------------------------------------

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

/**
 * A column's px as Excel's width: characters of its default font's widest digit (7 px for Arial 10 and Calibri 11), the
 * cell's padding included, as ECMA-376 (18.3.1.13) has Excel turn it back into pixels: trunc((256w + trunc(128/7)) / 256 × 7).
 */
const MDW = 7;
const xlWidth = (px: number) => Math.ceil((Math.max(0, px) * 256) / MDW - Math.trunc(128 / MDW)) / 256;
/** An Excel width as the px it shows. */
const pxOfWidth = (w: number) => Math.trunc(((256 * w + Math.trunc(128 / MDW)) / 256) * MDW);
/** A row's px as points. */
const xlHeight = (px: number) => Math.round(px * 0.75 * 100) / 100;
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
const xnum = (n: number) => (Object.is(n, -0) ? '0' : String(n));
/** Excel knows only its own errors: a formula that needs itself is written as #REF!. */
const xlError = (e: CellError) => (e.code === '#CIRC!' ? '#REF!' : e.code === '#ERROR!' || e.code === '#SPILL!' ? '#VALUE!' : e.code);

/** Excel's own number formats by their codes: a code that is one of them is written by its id. */
const BUILTIN_IDS = new Map<string, number>([
  ['General', 0],
  ['0', 1],
  ['0.00', 2],
  ['#,##0', 3],
  ['#,##0.00', 4],
  ['0%', 9],
  ['0.00%', 10],
  ['0.00E+00', 11],
  ['h:mm:ss', 21],
  ['[h]:mm:ss', 46],
  ['@', 49],
]);

/** The number format for a cell's style and value: one of Excel's own (by id), or a code (the style's own, or its kind's). */
function numFmtFor(s: CellStyle | undefined, v: Scalar): { id: number } | { code: string } {
  let code: string;
  if (s?.code) code = s.code;
  else if ((s?.fmt ?? 'general') === 'date') {
    // A plain date shows its time when it has one, and a time alone as a time.
    if (typeof v === 'number' && v > 0 && v < 1) return { code: 'hh:mm' };
    if (typeof v === 'number' && Math.abs(v - Math.round(v)) > 1 / 172800) return { code: 'yyyy-mm-dd hh:mm' };
    return { code: 'yyyy-mm-dd' };
  } else code = fmtCode(s);
  const id = BUILTIN_IDS.get(code);
  return id !== undefined ? { id } : { code };
}

/**
 * The cells' font in Excel: the editor shows them in the app's own (Inter) at 10pt, and Excel can carry no fonts, so
 * they are in the Office font closest to it at that size; and words sit in the middle of their rows, as in the editor.
 */
const XL_FONT = officeFont('Inter');
const XL_SIZE = FONT_PT;

/** The styles a file's cells use: fonts, fills, number formats and their combinations (cellXfs), each written once. */
class XlStyles {
  fonts = [`<font><sz val="${XL_SIZE}"/><name val="${XL_FONT}"/><family val="2"/></font>`];
  fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  codes: string[] = [];
  xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>'];
  /** Conditional formatting's looks. */
  dxfs = new Dxfs();
  private ix = new Map<string, number>();

  private once(list: string[], xml: string): number {
    const k = `${list === this.fonts ? 'f' : list === this.fills ? 'l' : list === this.borders ? 'b' : 'c'}:${xml}`;
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
    if (s && (s.b || s.i || s.u || s.s || s.color || s.size || s.font)) {
      font = this.once(
        this.fonts,
        `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.s ? '<strike/>' : ''}${s.u ? '<u/>' : ''}<sz val="${s.size ?? XL_SIZE}"/>${s.color ? `<color rgb="${argb(s.color)}"/>` : ''}<name val="${xesc(s.font ?? XL_FONT)}"/>${s.font ? '' : '<family val="2"/>'}</font>`,
      );
    }
    const fill = s?.fill ? this.once(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.fill)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const side = (tag: string, b: string | undefined) => {
      const x = borderOf(b);
      if (!x) return `<${tag}/>`;
      const style = x.kind === 'dashed' ? 'dashed' : x.kind === 'dotted' ? 'dotted' : x.kind === 'double' ? 'double' : x.kind;
      return `<${tag} style="${style}">${x.color ? `<color rgb="${argb(x.color)}"/>` : '<color auto="1"/>'}</${tag}>`;
    };
    const border = s && (s.bt || s.br || s.bb || s.bl) ? this.once(this.borders, `<border>${side('left', s.bl)}${side('right', s.br)}${side('top', s.bt)}${side('bottom', s.bb)}<diagonal/></border>`) : 0;
    // Excel turns words 1–90 degrees anticlockwise, and 91–180 for 1–90 clockwise.
    const rot = s?.rot ? (s.rot > 0 ? s.rot : 90 - s.rot) : 0;
    // Up and down as the editor puts words: in the middle of the row, wrapped ones from the top (the default style
    // has the middle, so a cell without its own alignment needs none).
    const vertical = s?.valign === 'top' || (s?.wrap && !s.valign) ? 'top' : s?.valign === 'bottom' ? 'bottom' : 'center';
    const al = s && (s.align || (s.valign && s.valign !== 'middle') || s.wrap || rot) ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''} vertical="${vertical}"${rot ? ` textRotation="${rot}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
    if (!numFmtId && !font && !fill && !al && !border) return 0;
    const xml = `<xf numFmtId="${numFmtId}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''} applyAlignment="1">${al || '<alignment vertical="center"/>'}</xf>`;
    return this.once(this.xfs, xml);
  }

  xml(): string {
    const codes = this.codes.length ? `<numFmts count="${this.codes.length}">${this.codes.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xesc(c)}"/>`).join('')}</numFmts>` : '';
    return (
      `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">${codes}` +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"><alignment vertical="center"/></xf></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      `${this.dxfs.xml()}<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`
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
    // Words that start or end with a space say so, as Excel's own files do (only there: ECMA-376's schema has no xml:space on them).
    const si = this.list.map((s) => `<si><t${/^\s|\s$/.test(s) ? ' xml:space="preserve"' : ''}>${xesc(s)}</t></si>`).join('');
    return `${XML_HEAD}<sst xmlns="${NS_MAIN}" count="${this.count}" uniqueCount="${this.list.length}">${si}</sst>`;
  }
}

/** The relationships a sheet's part points at: its charts' drawing and its notes' VML drawing; its cells' links. */
interface SheetLinks {
  drawing?: string;
  legacy?: string;
  /** Cells' links: a web address by its relationship, a place in the workbook as it is. */
  hyperlinks?: { ref: string; rid?: string; location?: string }[];
  /** The workbook's named ranges (lower case): formulas keep them as they are. */
  defined?: Set<string>;
}

/**
 * A sheet's part: its frozen panes, columns' widths, rows' heights and cells, each formula with what it gives, and its
 * rules (`lists`: where the lists kept on the hidden sheet of lists are; `ofLists`: this is that sheet, never the one picked).
 */
function sheetXml(sh: Sheet, si: number, calc: Calc, st: XlStyles, ss: XlStrings, names: Set<string>, links: SheetLinks = {}, lists?: Map<Validation, string>, ofLists = false): string {
  const e = calc.shownExtent(si);
  // Rows hidden by hand, or by the filter (Excel writes those hidden too, and its filter says why).
  const hidden = hiddenRows(sh, si, calc);
  // Formulas that spilled: written as array formulas over the cells they fill, with the values they spilled there.
  const spilt = new Map<number, string>();
  const ghosts: [number, number, Scalar, CellStyle | undefined][] = [];
  for (const { r, c, sp } of calc.spillsOf(si)) {
    spilt.set(pack(r, c), rangeName({ r1: r, c1: c, r2: r + sp.h - 1, c2: c + sp.w - 1 }));
    for (let i = 0; i < sp.h; i++) for (let j = 0; j < sp.w; j++) if ((i || j) && !sh.cells[refName(r + i, c + j)]) ghosts.push([r + i, c + j, sp.d[i * sp.w + j], sh.cells[refName(r, c)]?.s]);
  }
  const rows = new Map<number, string[]>();
  const order = new Map<string, number>();
  for (const k of calc.keys(si)) {
    const r = unpackR(k);
    const c = unpackC(k);
    const ref = refName(r, c);
    const cell = sh.cells[ref];
    if (!cell) continue;
    let xml: string;
    // A formula as Excel writes it; null for one Excel has nothing to work out with (AI, SPARKLINE): its value alone.
    const xf = cell.f !== undefined && !formulaProblem(cell.f) ? excelFormula(cell.f, names, links.defined) : undefined;
    if (xf === null) {
      const v = calc.value(si, r, c);
      const s = st.index(cell.s, v);
      const a = `r="${ref}"${s ? ` s="${s}"` : ''}`;
      if (typeof v === 'number') xml = `<c ${a}><v>${xnum(v)}</v></c>`;
      else if (typeof v === 'string' && v) xml = `<c ${a} t="s"><v>${ss.add(v)}</v></c>`;
      else if (typeof v === 'boolean') xml = `<c ${a} t="b"><v>${v ? 1 : 0}</v></c>`;
      else if (s) xml = `<c ${a}/>`;
      else continue;
    } else if (xf !== undefined) {
      const v = calc.value(si, r, c);
      const s = st.index(cell.s, v);
      const a = `r="${ref}"${s ? ` s="${s}"` : ''}`;
      const arrayRef = spilt.get(k);
      const f = arrayRef ? `<f t="array" ref="${arrayRef}">${xesc(xf)}</f>` : `<f>${xesc(xf)}</f>`;
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
    order.set(xml, c);
  }
  for (const [r, c, v, style] of ghosts) {
    const s = st.index(style, v);
    const a = `r="${refName(r, c)}"${s ? ` s="${s}"` : ''}`;
    const xml =
      typeof v === 'number'
        ? `<c ${a}><v>${xnum(v)}</v></c>`
        : typeof v === 'string'
          ? `<c ${a} t="str"><v>${xesc(v)}</v></c>`
          : typeof v === 'boolean'
            ? `<c ${a} t="b"><v>${v ? 1 : 0}</v></c>`
            : v instanceof CellError
              ? `<c ${a} t="e"><v>${xlError(v)}</v></c>`
              : '';
    if (!xml) continue;
    let list = rows.get(r);
    if (!list) rows.set(r, (list = []));
    list.push(xml);
    order.set(xml, c);
  }
  // Each row's cells left to right (what spilled went in after the cells of their own).
  for (const list of rows.values()) if (ghosts.length) list.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
  for (const k of Object.keys(sh.rows ?? {})) if (!rows.has(Number(k))) rows.set(Number(k), []);
  for (const r of hidden) if (!rows.has(r)) rows.set(r, []);
  // Groups of rows and columns: each row's (column's) outline level, the deepest group it is in.
  const spans = spansOf(sh);
  const levelOf = (list: typeof spans.rows) => {
    const m = new Map<number, number>();
    for (const s of list) for (let k = s.a; k <= Math.min(s.b, s.a + 20_000); k++) m.set(k, Math.max(m.get(k) ?? 0, s.level));
    return m;
  };
  const rowLevel = levelOf(spans.rows);
  const colLevel = levelOf(spans.cols);
  for (const r of rowLevel.keys()) if (!rows.has(r)) rows.set(r, []);
  const body = [...rows.keys()]
    .sort((a, b) => a - b)
    .map((r) => {
      const h = sh.rows?.[r]?.h;
      const cells = rows.get(r)!;
      const attrs = `r="${r + 1}"${h ? ` ht="${xlHeight(h)}" customHeight="1"` : ''}${hidden.has(r) ? ' hidden="1"' : ''}${rowLevel.get(r) ? ` outlineLevel="${Math.min(7, rowLevel.get(r)!)}"` : ''}`;
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
  const colKeys = new Set([...Object.keys(sh.cols ?? {}).map(Number), ...colLevel.keys()]);
  const widths = [...colKeys]
    .map((c) => [c, sh.cols?.[c]?.w, !!sh.cols?.[c]?.hidden, colLevel.get(c) ?? 0] as const)
    .filter(([, w, hid, lv]) => w || hid || lv)
    .sort((a, b) => a[0] - b[0]);
  const cols = widths.length ? `<cols>${widths.map(([c, w, hid, lv]) => `<col min="${c + 1}" max="${c + 1}" width="${xlWidth(w ?? COL_W)}"${hid ? ' hidden="1"' : ''}${w ? ' customWidth="1"' : ''}${lv ? ` outlineLevel="${Math.min(7, lv)}"` : ''}/>`).join('')}</cols>` : '';
  const outlineRow = Math.min(7, Math.max(0, ...rowLevel.values()));
  const outlineCol = Math.min(7, Math.max(0, ...colLevel.values()));
  // A whole sheet protected from changes (no password: the app has none), the cells it leaves open as ranges to edit.
  const guard = sh.protect?.find((p) => !p.range && !p.warn);
  const protection = guard
    ? `<sheetProtection sheet="1" objects="1" scenarios="1"/>${guard.except ? `<protectedRanges>${guard.except.split(',').map((x, i) => `<protectedRange sqref="${x}" name="Open${i + 1}"/>`).join('')}</protectedRanges>` : ''}`
    : '';
  // Printed as the app prints it: across the page when its columns are wider than an upright one holds, made smaller
  // to fit the page's width when they are wider than that too, 12 mm margins, its name at the top.
  const across = Array.from({ length: e.cols }, (_, c) => (sh.cols?.[c]?.hidden ? 0 : (sh.cols?.[c]?.w ?? COL_W))).reduce((a, b) => a + b, 0);
  const wide = across > 700;
  const fit = across > 1030;
  const mm12 = '0.4724';
  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
    (fit ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
    `<dimension ref="${e.rows ? `A1:${refName(e.rows - 1, Math.max(0, e.cols - 1))}` : 'A1'}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${sh.noGrid ? ' showGridLines="0"' : ''}${si === 0 && !ofLists ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>` +
    // Rows as tall as the editor's (24 px) unless they say.
    `<sheetFormatPr defaultColWidth="${xlWidth(COL_W)}" defaultRowHeight="${xlHeight(ROW_H)}" customHeight="1"${outlineRow ? ` outlineLevelRow="${outlineRow}"` : ''}${outlineCol ? ` outlineLevelCol="${outlineCol}"` : ''}/>${cols}` +
    `<sheetData>${body}</sheetData>` +
    protection +
    filterXml(sh, si, calc) +
    mergesXml(sh) +
    condXml(sh, st.dxfs, names) +
    validationXml(sh, names, lists) +
    (links.hyperlinks?.length ? `<hyperlinks>${links.hyperlinks.map((h) => `<hyperlink ref="${h.ref}"${h.rid ? ` r:id="${h.rid}"` : ''}${h.location ? ` location="${xesc(h.location)}"` : ''}/>`).join('')}</hyperlinks>` : '') +
    // The cells' lines, as the app prints round its table's cells (not across the empty ones charts stand over).
    (sh.charts?.length ? '' : '<printOptions gridLines="1"/>') +
    `<pageMargins left="${mm12}" right="${mm12}" top="${mm12}" bottom="${mm12}" header="0.2" footer="0.2"/>` +
    `<pageSetup orientation="${wide ? 'landscape' : 'portrait'}"${fit ? ' fitToWidth="1" fitToHeight="0"' : ''}/>` +
    `<headerFooter><oddHeader>${xesc(`&L&"-,Bold"&12&A`)}</oddHeader></headerFooter>` +
    (links.drawing ? `<drawing r:id="${links.drawing}"/>` : '') +
    (links.legacy ? `<legacyDrawing r:id="${links.legacy}"/>` : '') +
    '</worksheet>'
  );
}

/** The workbook as an Excel file (.xlsx) that opens in Excel, LibreOffice and Google Sheets: formulas kept, with what they give; filters, merged cells, conditional formatting, rules for cells, notes and charts too. */
export function xlsxOfBook(book: Workbook, title: string, calc: Calc = computeBook(book)): Buffer {
  const names = new Set(book.sheets.map((s) => s.name.toLowerCase()));
  const defined = new Set((book.names ?? []).map((n) => n.name.toLowerCase()));
  // Lists a rule cannot hold in its own words, and lists whose chips have colours: on a hidden sheet the rules point at.
  const lists = listsSheet(book);
  if (lists.sheet) names.add(lists.sheet.name.toLowerCase());
  const st = new XlStyles();
  const ss = new XlStrings();
  // Each sheet's other parts: its charts' drawing (with a chart part each) and its notes (comments and their VML).
  const extra: { name: string; data: string }[] = [];
  const overrides: string[] = [];
  let drawings = 0;
  let charts = 0;
  let notes = 0;
  let threads = 0;
  const sheets = book.sheets.map((sh, si) => {
    const links: SheetLinks = {};
    const rels: [string, string, string, boolean?][] = [];
    links.defined = defined;
    // Charts that cannot draw from their ranges are left out (the workbook keeps them, saying why).
    const drawn = (sh.charts ?? []).filter((ch) => !chartProblem(book, ch));
    if (drawn.length) {
      const d = ++drawings;
      const chartRels: [string, string, string][] = [];
      drawn.forEach((ch, i) => {
        const n = ++charts;
        extra.push({ name: `xl/charts/chart${n}.xml`, data: chartXml(book, ch, chartData(book, calc, si, ch, true), names) });
        overrides.push(`<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        chartRels.push([`rId${i + 1}`, 'chart', `../charts/chart${n}.xml`]);
      });
      extra.push({ name: `xl/drawings/drawing${d}.xml`, data: drawingXml(sh, drawn, (i) => `rId${i + 1}`) });
      extra.push({ name: `xl/drawings/_rels/drawing${d}.xml.rels`, data: relsXml(chartRels) });
      overrides.push(`<Override PartName="/xl/drawings/drawing${d}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      links.drawing = `rId${rels.length + 1}`;
      rels.push([links.drawing, 'drawing', `../drawings/drawing${d}.xml`]);
    }
    const nx = commentsXml(sh, si + 1);
    if (nx) {
      const k = ++notes;
      extra.push({ name: `xl/comments${k}.xml`, data: nx.comments });
      extra.push({ name: `xl/drawings/vmlDrawing${k}.vml`, data: nx.vml });
      overrides.push(`<Override PartName="/xl/comments${k}.xml" ContentType="${CT}.comments+xml"/>`);
      rels.push([`rId${rels.length + 1}`, 'comments', `../comments${k}.xml`]);
      links.legacy = `rId${rels.length + 1}`;
      rels.push([links.legacy, 'vmlDrawing', `../drawings/vmlDrawing${k}.vml`]);
      // Comments' threads, as Excel's own threaded comments.
      if (nx.threaded) {
        threads++;
        extra.push({ name: `xl/threadedComments/threadedComment${k}.xml`, data: nx.threaded });
        overrides.push(`<Override PartName="/xl/threadedComments/threadedComment${k}.xml" ContentType="application/vnd.ms-excel.threadedcomments+xml"/>`);
        rels.push([`rId${rels.length + 1}`, 'http://schemas.microsoft.com/office/2017/10/relationships/threadedComment', `../threadedComments/threadedComment${k}.xml`]);
      }
    }
    // Links on cells (Insert → Link): a web address through the sheet's relationships, a place in the workbook as it is.
    const hl: { ref: string; rid?: string; location?: string }[] = [];
    for (const [ref, cell] of Object.entries(sh.cells)) {
      if (!cell.link) continue;
      if (cell.link.startsWith('#')) hl.push({ ref, location: cell.link.slice(1) });
      else {
        const rid = `rId${rels.length + 1}`;
        rels.push([rid, 'hyperlink', cell.link, true]);
        hl.push({ ref, rid });
      }
    }
    if (hl.length) links.hyperlinks = hl;
    if (rels.length) extra.push({ name: `xl/worksheets/_rels/sheet${si + 1}.xml.rels`, data: relsXml(rels) });
    return sheetXml(sh, si, calc, st, ss, names, links, lists.ref);
  });
  // The sheet of lists goes after the others, hidden.
  if (lists.sheet) sheets.push(sheetXml(lists.sheet, 0, computeBook({ v: 1, sheets: [lists.sheet] }), st, ss, names, {}, undefined, true));
  const titles = [...book.sheets.map((s) => s.name), ...(lists.sheet ? [lists.sheet.name] : [])];
  const n = sheets.length;
  const types =
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    (notes ? '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>' : '') +
    `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`).join('') +
    `<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CT}.sharedStrings+xml"/>` +
    overrides.join('') +
    (threads ? '<Override PartName="/xl/persons/person.xml" ContentType="application/vnd.ms-excel.person+xml"/>' : '') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  const app =
    `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Hydor</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>` +
    `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${n}</vt:i4></vt:variant></vt:vector></HeadingPairs>` +
    `<TitlesOfParts><vt:vector size="${n}" baseType="lpstr">${titles.map((t) => `<vt:lpstr>${xesc(t)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>` +
    '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>';
  // Excel keeps each filter's range in a hidden name of its sheet's, and the rows each printed page repeats (the app's
  // print repeats a sheet's frozen rows, or a first row of words over the rest) in another.
  const filterNames = book.sheets
    .map((sh, i) => {
      const x = sh.filter ? parseRange(sh.filter.range) : null;
      const heads = headerRows(sh, i, calc);
      return (
        (x ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xesc(`${quoteSheet(sh.name)}!$${colName(x.c1)}$${x.r1 + 1}:$${colName(x.c2)}$${x.r2 + 1}`)}</definedName>` : '') +
        (heads ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xesc(`${quoteSheet(sh.name)}!$1:$${heads}`)}</definedName>` : '')
      );
    })
    .join('');
  // The workbook's named ranges (and named values and LAMBDAs), a sheet's own with its place.
  const ownNames = (book.names ?? [])
    .map((n) => {
      const f = excelFormula(n.ref, names, defined);
      const local = n.sheet ? book.sheets.findIndex((s) => s.id === n.sheet) : -1;
      return f === null ? '' : `<definedName name="${xesc(n.name)}"${local >= 0 ? ` localSheetId="${local}"` : ''}>${xesc(f)}</definedName>`;
    })
    .join('');
  const workbook =
    `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews>` +
    `<sheets>${titles.map((t, i) => `<sheet name="${xesc(t)}" sheetId="${i + 1}"${i >= book.sheets.length ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    (filterNames || ownNames ? `<definedNames>${filterNames}${ownNames}</definedNames>` : '') +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  const wbRels = relsXml([
    ...sheets.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`] as [string, string, string]),
    [`rId${n + 1}`, 'styles', 'styles.xml'],
    [`rId${n + 2}`, 'sharedStrings', 'sharedStrings.xml'],
    ...(threads ? [[`rId${n + 3}`, 'http://schemas.microsoft.com/office/2017/10/relationships/person', 'persons/person.xml'] as [string, string, string]] : []),
  ]);
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
    ...extra,
    ...(threads ? [{ name: 'xl/persons/person.xml', data: personsXml(namedAuthors(book)) }] : []),
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
 * For a file opened to be saved again (Files): `loses`, what of an Excel file the workbook cannot hold ("pictures",
 * "shapes", "charts" it cannot draw, "formulas" it cannot work out, "pivots", "tables", "links" to other files,
 * "hyperlinks", "names", "macros", "groups" of rows and columns, "sparklines", "icons" (icon sets), "protection", "print"
 * settings, "rich" text formatted in parts of a cell), and `cut`, whether some of its cells or sheets did not come in at all.
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
/** Groups of rows (or columns) a sheet's part has: for each outline level, each run of rows at it or deeper; folded away when all its rows are hidden. */
function groupsIn(xml: string, kind: 'row' | 'col'): { range: string; hidden?: boolean }[] {
  const level = new Map<number, number>();
  const hidden = new Set<number>();
  const re = kind === 'row' ? /<(?:\w+:)?row\b([^>]*)>/g : /<(?:\w+:)?col\b([^>]*?)\/?>/g;
  for (const m of xml.matchAll(re)) {
    const lv = Number(/\boutlineLevel="(\d)"/.exec(m[1])?.[1] ?? 0);
    if (!lv) continue;
    const hid = /\bhidden="(?:1|true)"/.test(m[1]);
    const [a, b] = kind === 'row' ? [Number(/\br="(\d+)"/.exec(m[1])?.[1] ?? 0), 0] : [Number(/\bmin="(\d+)"/.exec(m[1])?.[1] ?? 0), Number(/\bmax="(\d+)"/.exec(m[1])?.[1] ?? 0)];
    for (let k = a; k <= Math.max(a, b) && k - a < 20_000; k++) {
      if (k < 1) continue;
      level.set(k - 1, lv);
      if (hid) hidden.add(k - 1);
    }
  }
  const out: { range: string; hidden?: boolean }[] = [];
  const keys = [...level.keys()].sort((x, y) => x - y);
  for (let lv = 1; lv <= 7 && out.length < 200; lv++) {
    let start = -1;
    for (let i = 0; i <= keys.length; i++) {
      const k = keys[i];
      const on = k !== undefined && level.get(k)! >= lv && (start < 0 || k === keys[i - 1] + 1);
      if (on && start < 0) start = k;
      if (!on && start >= 0) {
        const end = keys[i - 1];
        let all = true;
        for (let j = start; j <= end && all; j++) all = hidden.has(j);
        const range = kind === 'row' ? `${start + 1}:${end + 1}` : `${colName(start)}:${colName(end)}`;
        out.push(all ? { range, hidden: true } : { range });
        start = k !== undefined && level.get(k)! >= lv ? k : -1;
      }
    }
  }
  return out;
}

/** A part's relationships to the web (its links' addresses), by id. */
function webTargets(z: Zip, part: string): Map<string, string> {
  const i = part.lastIndexOf('/');
  const xml = z.text(`${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`);
  const out = new Map<string, string>();
  for (const r of xml ? all(parseXml(xml).root, 'Relationship') : []) if (att(r, 'TargetMode') === 'External' && /\/hyperlink$/.test(att(r, 'Type') ?? '')) out.set(att(r, 'Id') ?? '', att(r, 'Target') ?? '');
  return out;
}

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
  [1, '0'], [2, '0.00'], [3, '#,##0'], [4, '#,##0.00'], [5, '$#,##0'], [6, '$#,##0'], [7, '$#,##0.00'], [8, '$#,##0.00'], [9, '0%'], [10, '0.00%'], [11, '0.00E+00'], [12, '# ?/?'], [13, '# ??/??'],
  [14, 'yyyy-mm-dd'], [15, 'd-mmm-yy'], [16, 'd-mmm'], [17, 'mmm-yy'], [18, 'h:mm AM/PM'], [19, 'h:mm:ss AM/PM'], [20, 'h:mm'], [21, 'h:mm:ss'], [22, 'yyyy-mm-dd h:mm'],
  [37, '#,##0'], [38, '#,##0'], [39, '#,##0.00'], [40, '#,##0.00'], [45, 'mm:ss'], [46, '[h]:mm:ss'], [47, 'mm:ss.0'], [48, '##0.0E+0'], [49, '@'],
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
  const baseFont = att(kid(fontEls[0], 'name'), 'val') ?? 'Calibri';
  const borders = kids(kid(root, 'borders'), 'border').map((b) => {
    const out: Obj = {};
    for (const [tag, k] of [
      ['top', 'bt'],
      ['right', 'br'],
      ['bottom', 'bb'],
      ['left', 'bl'],
    ] as const) {
      const el = kid(b, tag);
      const style = att(el, 'style');
      if (!style || style === 'none') continue;
      const kind = /^(medium|mediumDashed|mediumDashDot|mediumDashDotDot|slantDashDot)$/.test(style) ? 'medium' : style === 'thick' ? 'thick' : style === 'double' ? 'double' : /dash/i.test(style) ? 'dashed' : /dot/i.test(style) ? 'dotted' : 'thin';
      const color = colorOf(kid(el, 'color'), theme);
      out[k] = color && color !== '#000000' ? `${kind} ${color}` : kind;
    }
    return out;
  });
  const fonts = fontEls.map((f) => {
    const out: Obj = {};
    const name = att(kid(f, 'name'), 'val');
    if (name && name !== baseFont && fontOf(name)) out.font = fontOf(name);
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
    // The code itself goes in too: kept where no plain format shows the same ([Red] negatives, dd/mm/yyyy…).
    const code = codes.get(Number(att(xf, 'numFmtId') ?? 0)) ?? '';
    const fmt = fmtFromCode(code);
    const raw: Obj = { ...(fonts[Number(att(xf, 'fontId') ?? 0)] ?? {}), ...fmt, ...(fmt.fmt ? { code } : {}), ...(borders[Number(att(xf, 'borderId') ?? 0)] ?? {}) };
    const fill = fills[Number(att(xf, 'fillId') ?? 0)];
    if (fill) raw.fill = fill;
    const al = kid(xf, 'alignment');
    const h = att(al, 'horizontal');
    if (h === 'left' || h === 'right' || h === 'center') raw.align = h;
    else if (h === 'centerContinuous') raw.align = 'center';
    // The editor puts words in the middle of their rows, and wrapped ones at the top: those need no place of their own.
    const v = att(al, 'vertical');
    const wrap = on(att(al, 'wrapText'));
    if (v === 'top' && !wrap) raw.valign = 'top';
    else if (v === 'bottom') raw.valign = 'bottom';
    else if (v === 'center' && wrap) raw.valign = 'middle';
    if (wrap) raw.wrap = true;
    const rot = Number(att(al, 'textRotation') ?? 0);
    if (rot > 0 && rot <= 90) raw.rot = rot;
    else if (rot > 90 && rot <= 180) raw.rot = 90 - rot;
    return { s: cleanStyle(raw), date: fmt.fmt === 'date' || fmt.fmt === 'datetime' };
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
  // Words formatted in parts (a run of bold in a cell) come in as the cell's words alone.
  let rich = false;
  const shared = sst
    ? kids(parseXml(sst).root, 'si').map((si) => {
        let s = '';
        for (const x of si.c) {
          if (typeof x === 'string') continue;
          if (x.n === 'r' && kid(x, 'rPr')) rich = true;
          s += x.n === 't' ? textOf(x) : x.n === 'r' ? textOf(kid(x, 't')) : '';
        }
        return s;
      })
    : [];
  const theme = themeColors(z.text(of('theme') ?? 'xl/theme/theme1.xml'));
  // The people who wrote its threaded comments, by id.
  const persons = readPersons(z.text(of('person') ?? 'xl/persons/person.xml'));
  const stylesXml = z.text(of('styles') ?? 'xl/styles.xml');
  const styles = stylesOf(stylesXml, theme);
  const dxfs = readDxfs(stylesXml, (el) => colorOf(el, theme));
  // Names the workbook defines (TaxRate: Sheet1!$B$1, a value, a LAMBDA): kept as named ranges, formulas using them as
  // they are. One that cannot be kept (pointing into another file, say) has formulas get what it stands for, where it is
  // a plain reference.
  const names = new Map<string, string>();
  const kept: { name: string; ref: string; sheet?: string }[] = [];
  const listedSheets = all(kid(wb, 'sheets'), 'sheet').map((s) => att(s, 'name') ?? '');
  // What a workbook here does not hold, for a file to be saved again: their keys (importBook says which).
  const loses = new Set<string>();
  for (const d of all(kid(wb, 'definedNames'), 'definedName')) {
    const name = att(d, 'name') ?? '';
    const ref = textOf(d).trim();
    if (!name.startsWith('_xlnm.') && att(d, 'hidden') !== '1') {
      const f = formulaFromFile(ref);
      const local = att(d, 'localSheetId');
      if (isRangeName(name) && !formulaProblem(f) && !/\[\d+\]/.test(ref)) kept.push({ name, ref: f, ...(local !== undefined && listedSheets[Number(local)] ? { sheet: listedSheets[Number(local)] } : {}) });
      else {
        if (/^(?:'[^']+'|[A-Za-z_][\w.]*)!\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?$/.test(ref)) names.set(name.toLowerCase(), ref);
        loses.add('names');
      }
    }
    // Print areas and titles go (but the first rows repeated on each page, as the app prints a sheet's header rows
    // anyway, as its own files say).
    if (name === '_xlnm.Print_Area' || (name === '_xlnm.Print_Titles' && !/^(?:'(?:[^']|'')+'|[^!',]+)!\$1:\$[1-5]$/.test(ref))) loses.add('print');
  }
  if (rich) loses.add('rich');
  if (kid(wb, 'workbookProtection')) loses.add('protection');
  if (z.names().some((n) => /vbaProject\.bin$/i.test(n))) loses.add('macros');
  const sheets: Obj[] = [];
  // The hidden sheets of lists this app writes (sheet-parts.ts listsSheet): read for their lists, not kept as sheets.
  const listSheets: { name: string; cells: Record<string, Cell> }[] = [];
  const state = { cells: 0, drawn: false, bad: false, cutRows: false, cutCells: false };
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
    const partRels = relsOf(z, rel.target);
    const parts = [...partRels.values()];
    if (parts.some((r) => /\/pivotTable$/.test(r.type))) loses.add('pivots');
    if (parts.some((r) => /\/table$/.test(r.type))) loses.add('tables');
    // What a sheet has that a workbook here does not keep.
    // Links to other files' places, or of a range of cells, are not kept (a cell's link to the web or this workbook is).
    if (/<(?:\w+:)?hyperlink\b[^>]*\bref="[A-Z]+\d+:/.test(xml)) loses.add('hyperlinks');
    if (/<(?:\w+:)?sparklineGroups?[\s>]/.test(xml)) loses.add('sparklines');
    if (/<(?:\w+:)?cfRule\b[^>]*\btype="iconSet"/.test(xml) || /<x14:iconSet\b/.test(xml)) loses.add('icons');
    // A sheet's protection is kept (refusing changes, the ranges it leaves open), but not its password.
    if (/<(?:\w+:)?sheetProtection\b[^>]*\b(?:password|hashValue)=/.test(xml)) loses.add('protection');
    // A header or footer (but the sheet's name at the top, as the app prints it and its own files say).
    if (/<(?:\w+:)?(?:odd|even|first)(?:Header|Footer)>\s*[^<\s]/.test(xml.replace(/<(?:\w+:)?oddHeader>&amp;L&amp;(?:"|&quot;)-,Bold(?:"|&quot;)&amp;12&amp;A<\/(?:\w+:)?oddHeader>/, ''))) loses.add('print');
    const sheet = readWorksheet(xml, name, shared, styles, date1904, state, names);
    const base = sheet.base as { cells: Record<string, Cell>; cols: Record<number, { w?: number; hidden?: boolean }>; rows: Record<number, { h?: number; hidden?: boolean }> } & Obj;
    // Cells' links: to the web (by the sheet's relationships) or to a place in the workbook.
    for (const m of xml.matchAll(/<(?:\w+:)?hyperlink\b([^>]*)\/?>/g)) {
      const ref = /\bref="([A-Z]{1,3}\d{1,7})"/.exec(m[1])?.[1];
      const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
      const location = /\blocation="([^"]*)"/.exec(m[1])?.[1];
      const target = rid ? webTargets(z, rel.target).get(rid) : undefined;
      const link = cleanLink(target ?? (location ? `#${decode(location)}` : ''));
      if (ref && link) base.cells[ref] = { ...(base.cells[ref] ?? {}), link };
    }
    // The grid's lines hidden.
    if (/<(?:\w+:)?sheetView\b[^>]*\bshowGridLines="(?:0|false)"/.test(xml)) base.noGrid = true;
    // Groups of rows and columns: runs of rows (columns) at an outline level or deeper, each a group of that level.
    base.groups = [...groupsIn(xml, 'row'), ...groupsIn(xml, 'col')];
    if (/<(?:\w+:)?sheetProtection\b[^>]*\bsheet="(?:1|true)"/.test(xml)) {
      const open = [...xml.matchAll(/<(?:\w+:)?protectedRange\b[^>]*\bsqref="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).join(',');
      base.protect = [open ? { except: open } : {}];
    }
    if (isListsSheet(name) && /^(hidden|veryHidden)$/.test(att(s, 'state') ?? '')) {
      listSheets.push({ name, cells: base.cells });
      continue;
    }
    base.conditional = readConditional(xml, dxfs, names, (el) => colorOf(el, theme));
    base.validation = readValidation(xml, names);
    // Comments' threads (threaded comments), and notes: the comments part's words on their cells (a threaded comment's
    // plain copy there is its thread's, not a note).
    const threadedRel = parts.find((r) => /\/threadedComment$/.test(r.type));
    const threads = readThreaded(threadedRel ? z.text(threadedRel.target) : null, persons);
    const comments = parts.find((r) => /\/comments$/.test(r.type));
    const got = readNotes(comments ? z.text(comments.target) : null, new Set(threads.map((c) => c.cell)));
    for (const [ref, note] of got.notes) base.cells[ref] = { ...(base.cells[ref] ?? {}), note };
    base.comments = [...threads, ...got.threads];
    // Charts from the drawing; pictures in it are what is left out.
    const drawingRel = parts.find((r) => /\/drawing$/.test(r.type));
    const drawing = drawingRel ? z.text(drawingRel.target) : null;
    if (drawing) {
      const dRels = relsOf(z, drawingRel!.target);
      const colW = (c: number) => (base.cols[c]?.hidden ? 0 : (base.cols[c]?.w ?? COL_W));
      const rowH = (r: number) => (base.rows[r]?.hidden ? 0 : (base.rows[r]?.h ?? ROW_H));
      base.charts = readCharts(drawing, (rid) => (dRels.get(rid) ? z.text(dRels.get(rid)!.target) : null), name, colW, rowH).map((ch) => wholeRange(ch, base.cells));
      const left = [
        /<(?:\w+:)?pic[\s>]/.test(drawing) && 'pictures',
        /<(?:\w+:)?sp[\s>]/.test(drawing) && 'shapes',
        (base.charts as unknown[]).length < (drawing.match(/<(?:\w+:)?graphicFrame[\s>]/g)?.length ?? 0) && 'charts',
      ].filter((k): k is string => !!k);
      for (const k of left) loses.add(k);
      if (left.length) state.drawn = true;
    }
    sheets.push(sheet);
    if (sheets.length >= SHEET_LIMITS.sheets) {
      cutSheets = listed.indexOf(s) < listed.length - 1;
      break;
    }
  }
  if (!sheets.length) throw new Error('This Excel file has no sheets of cells in it.');
  // Lists on that hidden sheet are lists of options again, with their chips' colours; the conditional formatting this
  // app writes to show those colours in Excel is theirs, not a rule of the sheet's.
  if (listSheets.length)
    for (const sh of sheets) {
      const base = sh.base as Obj;
      base.validation = (base.validation as Validation[]).map((v) => {
        const options = v.type === 'list' && v.source ? listFromSheet(v.source, listSheets) : null;
        if (!options) return v;
        const { source: _s, ...rest } = v;
        return { ...rest, options };
      });
      if (Array.isArray(base.conditional)) base.conditional = (base.conditional as CondRule[]).filter((r) => !isListColor(r, base.validation as Validation[]));
    }
  if (state.drawn) notes.push('Pictures, shapes and charts this cannot draw were left out.');
  if (state.bad) notes.push('Some formulas could not be read here (links to other files, tables by name…): their last values were kept instead.');
  if (state.cutRows) notes.push(`Cells past row ${SHEET_LIMITS.rows.toLocaleString('en')} or column ${colName(SHEET_LIMITS.cols - 1)} were left out.`);
  if (state.cutCells) notes.push(`Only the first ${SHEET_LIMITS.cells.toLocaleString('en')} cells were taken in.`);
  if (cutSheets) notes.push(`Only the first ${SHEET_LIMITS.sheets} sheets were taken in.`);
  if (state.bad) loses.add('formulas');
  if (z.names().some((n) => n.startsWith('xl/externalLinks/'))) loses.add('links');
  return { book: plainCharts(normalizeBook({ sheets, names: kept }, { notes })), notes, loses: [...loses], cut: state.cutRows || state.cutCells || cutSheets };
}

/**
 * A workbook's charts without what the app would take for them anyway (whether the first column is labels and the
 * first row names, where the legend goes): a chart written here comes back as it was kept, and one made in Excel
 * keeps only what makes it draw as it did there.
 */
function plainCharts(book: Workbook): Workbook {
  if (!book.sheets.some((s) => s.charts?.length)) return book;
  const calc = computeBook(book);
  book.sheets.forEach((sh, si) => {
    if (!sh.charts) return;
    sh.charts = sh.charts.map((ch) => {
      let out = ch;
      for (const k of ['labels', 'names'] as const) {
        if (out[k] === undefined) continue;
        const { [k]: _drop, ...rest } = out;
        if (JSON.stringify(chartData(book, calc, si, rest)) === JSON.stringify(chartData(book, calc, si, out))) out = rest;
      }
      const pie = out.kind === 'pie' || out.kind === 'doughnut';
      const series = chartData(book, calc, si, out)?.series.length ?? 0;
      if (out.legend !== undefined && out.legend === (pie || series > 1 ? 'bottom' : 'none')) {
        const { legend: _l, ...rest } = out;
        out = rest;
      }
      return out;
    });
  });
  return book;
}

/**
 * A chart read from its series as a range in parts, as one range when the columns (rows) between its parts hold no
 * numbers to draw (words, or nothing): the block of cells it was made from, which draws the same.
 */
function wholeRange(ch: SheetChart, cells: Record<string, Cell>): SheetChart {
  const parts = chartParts(ch.range);
  if (!parts || parts.length < 2 || parts.some((p) => p.sheet !== undefined)) return ch;
  const rows = ch.by === 'rows';
  const u: Rect = { r1: Math.min(...parts.map((p) => p.x.r1)), c1: Math.min(...parts.map((p) => p.x.c1)), r2: Math.max(...parts.map((p) => p.x.r2)), c2: Math.max(...parts.map((p) => p.x.c2)) };
  // The parts' lines, one after another and in order, with only gaps of words between them.
  const own = new Set(parts.flatMap((p) => Array.from({ length: (rows ? p.x.r2 - p.x.r1 : p.x.c2 - p.x.c1) + 1 }, (_, k) => (rows ? p.x.r1 : p.x.c1) + k)));
  const order = parts.map((p) => (rows ? p.x.r1 : p.x.c1));
  if (order.some((v, i) => i && v < order[i - 1]) || parts.some((p) => (rows ? p.x.c1 !== u.c1 || p.x.c2 !== u.c2 : p.x.r1 !== u.r1 || p.x.r2 !== u.r2))) return ch;
  for (let i = rows ? u.r1 : u.c1; i <= (rows ? u.r2 : u.c2); i++) {
    if (own.has(i)) continue;
    for (let j = (rows ? u.c1 : u.r1) + 1; j <= (rows ? u.c2 : u.r2); j++) {
      const cell = cells[rows ? refName(i, j) : refName(j, i)];
      if (cell && (cell.f !== undefined || typeof cell.v === 'number')) return ch;
    }
  }
  return { ...ch, range: rangeName(u) };
}

/** One worksheet's XML, read as it streams by (a big sheet is never held as a tree). */
function readWorksheet(xml: string, name: string, shared: string[], styles: { s?: CellStyle; date: boolean }[], date1904: boolean, state: { cells: number; bad: boolean; cutRows: boolean; cutCells: boolean }, names: Map<string, string>): Obj {
  const cells: Record<string, Cell> = {};
  const cols: Record<number, { w?: number; hidden?: boolean }> = {};
  const rows: Record<number, { h?: number; hidden?: boolean }> = {};
  const merges: string[] = [];
  // Array formulas of the functions that spill here, by the cells they fill.
  const arrays: Rect[] = [];
  // What formulas gave when the file was saved, to know what a filter's rows show.
  const cached = new Map<string, string | number | boolean>();
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
    // A cell an array formula that spills here fills: its value is the formula's again, not the cell's own.
    if (!f && arrays.some((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2 && !(r === x.r1 && c === x.c1))) return;
    let formula: string | undefined;
    if (fa && fa.t === 'shared' && fa.si !== undefined) {
      if (f) masters.set(fa.si, { f, r, c });
      const m = masters.get(fa.si);
      if (m) formula = f || shiftFormula(m.f, r - m.r, c - m.c);
    } else if (fa && fa.t !== 'dataTable' && f) {
      formula = f;
      const x = fa.t === 'array' && fa.ref ? parseRange(fa.ref) : null;
      if (x && (x.r1 !== x.r2 || x.c1 !== x.c2) && spills(replaceNames(formulaFromFile(f), names))) arrays.push(x);
    }
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
      if (value !== undefined && value !== '') cached.set(refName(r, c), value);
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
          if (on(a.hidden) && row < SHEET_LIMITS.rows) rows[row] = { ...rows[row], hidden: true };
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
          if (on(a.customWidth) && a.width && max - min < 50) for (let k = min - 1; k < max; k++) cols[k] = { w: pxOfWidth(Number(a.width)) };
          if (on(a.hidden) && max - min < 500) for (let k = min - 1; k < max; k++) cols[k] = { ...cols[k], hidden: true };
          break;
        }
        case 'pane':
          if (a.state === 'frozen' || a.state === 'frozenSplit') freeze = { rows: Number(a.ySplit ?? 0) || 0, cols: Number(a.xSplit ?? 0) || 0 };
          break;
        case 'mergeCell':
          if (a.ref && merges.length < SHEET_LIMITS.merges) merges.push(a.ref);
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
  // A filter's rows were written hidden: the filter hides them again here, so they are not hidden by hand too.
  const filter = readFilter(xml, (r, c) => {
    const k = refName(r, c);
    const cell = cells[k];
    const v = cell?.f !== undefined ? cached.get(k) : cell?.v;
    return v === undefined ? '' : formatValue(v, cell?.s);
  });
  const fx = filter ? parseRange(filter.range) : null;
  if (filter?.cols && fx) for (let r = fx.r1 + 1; r <= fx.r2; r++) if (rows[r]?.hidden) rows[r] = { ...rows[r], hidden: undefined };
  return { name, base: { cells, cols, rows, merges, ...(filter ? { filter } : {}) }, ...(freeze ? { freeze } : {}) };
}

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

/**
 * An OpenDocument spreadsheet's sheets: values, formulas (with their last values where they cannot be read here),
 * formats; merged cells, data validation, conditional formatting and notes (sheet-ods.ts).
 */
function readOds(z: Zip, notes: string[]): { book: Workbook; notes: string[] } {
  const xml = z.text('content.xml');
  if (!xml) throw new Error('This OpenDocument file has no content in it.');
  const { root, cut } = parseXml(xml, 3_000_000);
  if (cut) notes.push('The file is too big to read whole: only its first part was taken in.');
  const stylesXml = z.text('styles.xml');
  const stylesRoot = stylesXml ? parseXml(stylesXml).root : null;
  const looks = odsStyles(root, stylesRoot);
  const condLooks = odsCondStyles(stylesRoot, root);
  const rules = odsValidations(root);
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
    const merges: string[] = [];
    const ruled = new Map<string, Rect[]>();
    const noted = new Map<string, string>();
    let r = 0;
    for (const row of rowsOf(t)) {
      const rep = Math.max(1, Number(att(row, 'number-rows-repeated') ?? 1) || 1);
      const list = kids(row).filter((x) => x.n === 'table-cell' || x.n === 'covered-table-cell');
      // Merges, rules and notes, empty cells' too (a rule on a whole column covers rows written as one, repeated).
      let c0 = 0;
      for (const x of list) {
        const crep = Math.max(1, Number(att(x, 'number-columns-repeated') ?? 1) || 1);
        if (r < SHEET_LIMITS.rows && c0 < SHEET_LIMITS.cols) {
          const name = att(x, 'content-validation-name');
          if (name && rules.has(name)) {
            const at = { r1: r, c1: c0, r2: Math.min(r + rep, SHEET_LIMITS.rows) - 1, c2: Math.min(c0 + crep, SHEET_LIMITS.cols) - 1 };
            (ruled.get(name) ?? ruled.set(name, []).get(name)!).push(at);
          }
          const across = Number(att(x, 'number-columns-spanned') ?? 1) || 1;
          const down = Number(att(x, 'number-rows-spanned') ?? 1) || 1;
          if (x.n === 'table-cell' && (across > 1 || down > 1) && merges.length < SHEET_LIMITS.merges) merges.push(rangeName({ r1: r, c1: c0, r2: r + down - 1, c2: c0 + across - 1 }));
          const note = odsNote(x);
          if (note) noted.set(refName(r, c0), note);
        }
        c0 += crep;
      }
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
    for (const [ref, note] of noted) cells[ref] = { ...(cells[ref] ?? {}), note };
    const validation = [...ruled].map(([name, at]) => ({ ...rules.get(name)!, range: joinRects(at).slice(0, 20).map(rangeName).join(',') }));
    sheets.push({ name: att(t, 'name') ?? `Sheet ${sheets.length + 1}`, base: { cells, merges, validation, conditional: odsConditional(t, condLooks) } });
  }
  if (!sheets.length) throw new Error('This OpenDocument file has no sheets in it.');
  if (bad) notes.push('Some formulas could not be read here: their last values were kept instead.');
  if (count >= SHEET_LIMITS.cells) notes.push(`Only the first ${SHEET_LIMITS.cells.toLocaleString('en')} cells were taken in.`);
  return { book: normalizeBook({ sheets }, { notes }), notes };
}

// ---- the workbook's own page ------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A page is a workbook's own by its marker. */
export const isBookPage = (html: string) => html.slice(0, 2000).includes('<meta name="generator" content="Hydor sheets">');

const FONT = 'var(--n-font,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif)';
const LINE = 'var(--n-line,#e2e0da)';
const SOFT = 'var(--n-soft,#f1efea)';
const MUTED = 'var(--n-muted,#6b665c)';
const BG = 'var(--n-bg,#ffffff)';
const HEAD_H = 22;
const NUM_W = 42;

/** Cells' marks and widgets as the page shows them: a note's corner, a list's chip, a checkbox, stars, an amount's sign at the edge, turned words. */
const SMART_CSS = [
  '.nb-t td.nt{position:relative}',
  '.nb-t td.nt::after{content:"";position:absolute;top:0;right:0;border-style:solid;border-width:0 7px 7px 0;border-color:transparent #e37400 transparent transparent}',
  '.nb-chip{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;padding:0 8px;border-radius:10px;line-height:18px;font-size:.92em}',
  '.nb-cb{font-size:1.2em;line-height:1}',
  '.nb-stars{color:#f5a623;letter-spacing:1px}',
  '.nb-acc{float:left;margin-right:6px}',
  '.nb-rot{display:inline-block;white-space:nowrap}',
].join('');

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
  '.nb-t td.f{color:var(--n-accent,#805a00)}',
  '.nb-scroll{position:relative}',
  `.nb-tabs{display:flex;gap:2px;padding:4px 6px;border-top:1px solid ${LINE};overflow-x:auto;flex-shrink:0;background:${BG}}`,
  `.nb-tabs button{font:inherit;font-size:12.5px;border:0;background:transparent;color:${MUTED};padding:5px 12px;border-radius:7px;cursor:pointer;white-space:nowrap}`,
  '.nb-tabs button[aria-selected=true]{background:var(--n-accent-soft,rgba(128,90,0,.12));color:var(--n-accent,#805a00);font-weight:600}',
  `.nb-note{padding:6px 10px;color:${MUTED};font-size:12px}`,
  `.nb-empty{padding:28px 12px;color:${MUTED};text-align:center}`,
  `.nb-chart{position:absolute;z-index:7;box-sizing:border-box;background:${BG};border:1px solid ${LINE};border-radius:8px;color:var(--n-fg,#1d1b17);overflow:hidden}`,
  SMART_CSS,
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
  '.nb-charts{display:flex;flex-wrap:wrap;gap:10pt;margin-top:10pt}.nb-chart{break-inside:avoid;border:0.5pt solid #c9c6bf;border-radius:4pt;color:#222;max-width:100%}.nb-chart svg{max-width:100%;height:auto}',
  SMART_CSS,
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

/** A cell's look as CSS (its colours, type, alignment, font), from its checked style only. */
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
  if (s.font && CELL_FONTS[s.font]) out.push(`font-family:${CELL_FONTS[s.font]}`);
  return out.join(';');
}

/** A border's CSS (its weight, pattern and colour; the text's colour when it has none). */
function borderCss(b: string | undefined, ink: string): string | null {
  const x = borderOf(b);
  if (!x) return null;
  const width = x.kind === 'medium' ? 2 : x.kind === 'thick' || x.kind === 'double' ? 3 : 1;
  const style = x.kind === 'dashed' ? 'dashed' : x.kind === 'dotted' ? 'dotted' : x.kind === 'double' ? 'double' : 'solid';
  return `${width}px ${style} ${x.color ?? ink}`;
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
  /** The colour of borders without one of their own. */
  ink?: string;
}

/**
 * A sheet as a table: its cells as they show, with what conditional formatting gives them, words running over empty
 * neighbours as in a spreadsheet; merged cells as one, hidden rows and columns (and those the filter hides) left out;
 * checkboxes, lists' chips, stars and notes' corners as the editor draws them.
 */
function tableHtml(sh: Sheet, si: number, calc: Calc, o: TableOpts, cls: CssClasses): string {
  const hidR = hiddenRows(sh, si, calc);
  const hidC = hiddenCols(sh);
  const rowsShown: number[] = [];
  for (let r = 0; r < o.rows; r++) if (!hidR.has(r)) rowsShown.push(r);
  const colsShown: number[] = [];
  for (let c = 0; c < o.cols; c++) if (!hidC.has(c)) colsShown.push(c);
  const w = (c: number) => Math.round((sh.cols?.[c]?.w ?? COL_W) * o.k);
  const h = (r: number) => Math.round((sh.rows?.[r]?.h ?? ROW_H) * o.k);
  const fr = o.sticky ? Math.min(sh.freeze?.rows ?? 0, o.rows) : 0;
  const fc = o.sticky ? Math.min(sh.freeze?.cols ?? 0, o.cols) : 0;
  const head = o.heads ? Math.round(HEAD_H * o.k) : 0;
  const numW = o.heads ? Math.round(NUM_W * o.k) : 0;
  const ink = o.ink ?? 'currentColor';
  const top: number[] = [];
  for (let r = 0, y = head; r < fr; r++) if (!hidR.has(r)) ((top[r] = y), (y += h(r)));
  const left: number[] = [];
  for (let c = 0, x = numW; c < fc; c++) if (!hidC.has(c)) ((left[c] = x), (x += w(c)));
  const merges = new Merges(sh.merges);
  const cf = new CondFormats(sh, si, calc);
  const rules = new Rules(sh);
  // What formulas spilled into cells that hold nothing, in their formula's number format.
  const ghosts = new Map<string, Cell>();
  for (const { r, c, sp } of calc.spillsOf(si))
    for (let i = 0; i < Math.min(sp.h, o.rows - r); i++)
      for (let j = 0; j < Math.min(sp.w, o.cols - c); j++) {
        const k = refName(r + i, c + j);
        const v = sp.d[i * sp.w + j];
        if ((i || j) && !sh.cells[k]?.v && sh.cells[k]?.f === undefined && v !== null && typeof v !== 'object') ghosts.set(k, { v, ...(sh.cells[refName(r, c)]?.s ? { s: sh.cells[refName(r, c)]!.s } : {}) });
      }
  // As wide as its columns (wider when there is room: the last column takes it), never squeezed narrower.
  let total = numW;
  for (const c of colsShown) total += w(c);
  const out: string[] = [`<table class="nb-t" style="width:${total}px"><colgroup>${o.heads ? `<col style="width:${numW}px">` : ''}`];
  for (const c of colsShown) out.push(`<col style="width:${w(c)}px">`);
  // A last column takes what width is left, so the grid fills the page.
  out.push(o.heads ? '<col></colgroup>' : '</colgroup>');
  if (o.heads) {
    out.push(`<thead><tr><th class="nb-k"></th>`);
    for (const c of colsShown) out.push(c < fc ? `<th class="fz" style="left:${left[c]}px">${colName(c)}</th>` : `<th>${colName(c)}</th>`);
    out.push('<th></th></tr></thead>');
  }
  const filtered = sh.filter ? parseRange(sh.filter.range) : null;
  const body: string[] = [];
  const headRows: string[] = [];
  const nextShown = (list: number[], i: number) => list[list.indexOf(i) + 1];
  for (const r of rowsShown) {
    const row: string[] = [`<tr style="height:${h(r)}px">`];
    const frozenRow = r < fr;
    // Rows a filter runs over are numbered in its colour, as spreadsheets mark a filtered range.
    const inFilter = !!filtered && !!sh.filter?.cols && r > filtered.r1 && r <= filtered.r2;
    if (o.heads) row.push(`<th${frozenRow ? ` class="fz${inFilter ? ' f' : ''}" style="top:${top[r]}px"` : inFilter ? ' class="f"' : ''}>${r + 1}</th>`);
    for (let ci = 0; ci < colsShown.length; ci++) {
      const c = colsShown[ci];
      const m = merges.at(r, c);
      if (m && (m.r1 !== r || m.c1 !== c)) {
        // Covered by a merge: nothing, unless the merge's first cell is hidden (then the first shown cell stands for it).
        const firstShown = rowsShown.find((x) => x >= m.r1 && x <= m.r2) === r && colsShown.find((x) => x >= m.c1 && x <= m.c2) === c;
        if (!firstShown) continue;
      }
      const cell = ghosts.get(refName(m ? m.r1 : r, m ? m.c1 : c)) ?? sh.cells[refName(m ? m.r1 : r, m ? m.c1 : c)];
      const sticky: string[] = [];
      if (frozenRow) sticky.push(`top:${top[r]}px`);
      if (c < fc) sticky.push(`left:${left[c]}px`);
      const classes: string[] = sticky.length ? ['fz'] : [];
      const inline: string[] = [...sticky];
      let rowspan = 1;
      let colspan = 1;
      if (m) {
        rowspan = rowsShown.filter((x) => x >= m.r1 && x <= m.r2).length;
        colspan = colsShown.filter((x) => x >= m.c1 && x <= m.c2).length;
      }
      // Borders: this cell's right and bottom edges are its own, or its neighbour's left and top.
      const rr = m ? m.r1 : r;
      const cc = m ? m.c1 : c;
      const s = cell?.s;
      const right = nextShown(colsShown, m ? m.c2 : c);
      const below = nextShown(rowsShown, m ? m.r2 : r);
      const br = borderCss(s?.br ?? (right !== undefined ? sh.cells[refName(rr, right)]?.s?.bl : undefined), ink);
      const bb = borderCss(s?.bb ?? (below !== undefined ? sh.cells[refName(below, cc)]?.s?.bt : undefined), ink);
      if (br) inline.push(`border-right:${br}`);
      if (bb) inline.push(`border-bottom:${bb}`);
      if (r === rowsShown[0] && s?.bt) inline.push(`border-top:${borderCss(s.bt, ink)}`);
      if (ci === 0 && s?.bl) inline.push(`border-left:${borderCss(s.bl, ink)}`);
      const attrs = (extra = '') => `${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${colspan > 1 ? ` colspan="${colspan}"` : ''}${classes.length ? ` class="${classes.join(' ')}"` : ''}${inline.length ? ` style="${inline.join(';')}"` : ''}${extra}`;
      if (!cell || (cell.v === undefined && cell.f === undefined && !cell.s && !cell.note)) {
        row.push(`<td${attrs()}></td>`);
        continue;
      }
      const v = cell.v === undefined && cell.f === undefined ? null : ghosts.has(refName(rr, cc)) ? cell.v! : calc.value(si, rr, cc);
      const text = formatValue(v, s);
      if (isError(v)) classes.push('e');
      else if (typeof v === 'number') classes.push('n');
      else if (typeof v === 'boolean') classes.push('b');
      if (s?.wrap) classes.push('w');
      const k = cls.get(cellCss(s, o.k));
      if (k) classes.push(k);
      const codeInk = codeColor(v, s?.code);
      if (codeInk) inline.push(`color:${codeInk}`);
      // Conditional formatting: its look over the cell's own, a colour scale's fill, a data bar.
      const look = cf.any ? cf.at(rr, cc) : null;
      if (look?.style) {
        const st = look.style;
        if (st.b) inline.push('font-weight:700');
        if (st.i) inline.push('font-style:italic');
        if (st.u || st.s) inline.push(`text-decoration:${[st.u ? 'underline' : '', st.s ? 'line-through' : ''].filter(Boolean).join(' ')}`);
        if (st.fill) inline.push(`background:${st.fill}`);
        if (st.color || st.fill) inline.push(`color:${st.color ?? textOn(st.fill!)}`);
      }
      if (look?.scale && !look.style?.fill) inline.push(`background:${look.scale}`, `color:${s?.color ?? textOn(look.scale)}`);
      if (look?.bar) {
        const a = Math.round(look.bar.from * 1000) / 10;
        const b = Math.round(look.bar.to * 1000) / 10;
        inline.push(`background:linear-gradient(90deg,transparent ${a}%,${look.bar.color}b0 ${a}%,${look.bar.color}b0 ${b}%,transparent ${b}%)`);
      }
      if (cell.note) classes.push('nt');
      // What the cell's rule draws: a checkbox, stars, a coloured chip.
      const rule = rules.any ? rules.at(rr, cc)?.rule : undefined;
      let inner = esc(text);
      if (rule?.type === 'checkbox') {
        inner = `<span class="nb-cb">${isTicked(v) ? '☑' : '☐'}</span>`;
        if (!classes.includes('b')) classes.push('b');
      } else if (rule?.type === 'rating' && (typeof v === 'number' || v === null)) {
        const n = Math.max(0, Math.min(rule.max ?? 5, Math.round(typeof v === 'number' ? v : 0)));
        inner = `<span class="nb-stars">${'★'.repeat(n)}<span style="opacity:.3">${'★'.repeat((rule.max ?? 5) - n)}</span></span>`;
      } else if (rule?.type === 'list' && text) {
        const opt = listOptions(calc, si, rule).find((x) => x.v.toLowerCase() === text.trim().toLowerCase());
        if (opt?.color) inner = `<span class="nb-chip" style="background:${opt.color};color:${textOn(opt.color)}">${esc(text)}</span>`;
      } else if (s?.fmt === 'accounting' && typeof v === 'number' && !s.code) {
        const [cur, num] = accountingParts(v, s);
        inner = `<span class="nb-acc">${esc(cur)}</span>${esc(num)}`;
      }
      if (s?.rot) inner = `<span class="nb-rot" style="transform:rotate(${-s.rot}deg)">${inner}</span>`;
      // Words run on over the empty cells to their right, as far as they need (not out of the frozen columns, nor into a merge).
      let span = colspan;
      if (!m && typeof v === 'string' && !s?.wrap && !s?.rot && (s?.align ?? 'left') === 'left' && !(c < fc) && !rule) {
        let room = w(c);
        const need = text.length * 7.2 * o.k * (s?.size ? s.size / 10 : 1) + 10;
        let j = ci + 1;
        while (room < need && j < colsShown.length) {
          const nc = colsShown[j];
          const next = sh.cells[refName(r, nc)];
          if ((next && (next.v !== undefined || next.f !== undefined || next.s?.fill)) || merges.at(r, nc)) break;
          room += w(nc);
          j++;
        }
        span = j - ci;
      }
      colspan = span;
      row.push(`<td${attrs(cell.note ? ` title="${esc(cell.note)}"` : '')}>${inner}</td>`);
      ci += span - 1;
    }
    if (o.heads) row.push('<td></td>');
    row.push('</tr>');
    (r < o.thead ? headRows : body).push(row.join(''));
  }
  if (headRows.length) out.push(`<thead>${headRows.join('')}</thead>`);
  out.push(`<tbody>${body.join('')}</tbody></table>`);
  return out.join('');
}

/**
 * A sheet's charts as the page shows them: over the table where the editor shows them (`over`: between their corners'
 * cells, as the table draws them, rows and columns it leaves out folded away), or one after another at their size.
 */
function chartsHtml(book: Workbook, sh: Sheet, si: number, calc: Calc, over: { numW: number; head: number; k: number } | null): string {
  const shown = sheetSizes(sh, hiddenRows(sh, si, calc));
  const whole = sheetSizes(sh, undefined, true);
  return (sh.charts ?? [])
    .map((ch) => {
      const box = chartBox(ch, over ? shown : whole);
      if (over && (box.w < 1 || box.h < 1)) return '';
      const w = Math.max(160, Math.round(box.w));
      const h = Math.max(120, Math.round(box.h));
      const svg = chartSvg(ch, chartData(book, calc, si, ch), w, h, undefined, { problem: chartProblem(book, ch) });
      if (!over) return `<div class="nb-chart" style="width:${w}px">${svg}</div>`;
      const k = over.k;
      return `<div class="nb-chart" style="left:${Math.round(over.numW + box.x * k)}px;top:${Math.round(over.head + box.y * k)}px;width:${Math.round(box.w * k)}px;height:${Math.round(box.h * k)}px">${svg.replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"')}</div>`;
    })
    .join('');
}

const VIEW_ROWS = 2000;
const VIEW_COLS = 200;
const PRINT_ROWS = 10_000;

const TABS_JS =
  "(function(){var b=document.body;if((window.hydor&&window.hydor.fill)||window.parent===window)b.classList.add('nb-fill');" +
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
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="generator" content="Hydor sheets"><style>${css}`;
  if (mode === 'still') {
    const sh = book.sheets[0];
    const e = calc.shownExtent(0);
    const k = 1.25;
    let cols = 0;
    for (let x = Math.round(NUM_W * k); x < 1280 && cols < SHEET_LIMITS.cols; cols++) x += sh.cols?.[cols]?.hidden ? 0 : Math.round((sh.cols?.[cols]?.w ?? COL_W) * k);
    let rows = 0;
    for (let y = Math.round(HEAD_H * k); y < 800 && rows < SHEET_LIMITS.rows; rows++) y += sh.rows?.[rows]?.hidden ? 0 : Math.round((sh.rows?.[rows]?.h ?? ROW_H) * k);
    const table = tableHtml(sh, 0, calc, { rows: Math.max(rows, 1), cols: Math.max(cols, Math.min(e.cols, 12)), heads: true, sticky: false, k, thead: 0 }, cls);
    const charts = chartsHtml(book, sh, 0, calc, { numW: Math.round(NUM_W * k), head: Math.round(HEAD_H * k), k });
    const css = `${VIEW_CSS}body.nb-body{font-size:${13 * k}px;overflow:hidden;width:1280px;height:800px}.nb-t th{font-size:${11 * k}px}.nb-t thead th{height:${Math.round(HEAD_H * k)}px}${cls.css()}`;
    return `${head(css)}</style></head><body class="nb-body"><div class="nb"><div class="nb-scroll" style="overflow:hidden">${table}${charts}</div></div></body></html>`;
  }
  if (mode === 'print') {
    const parts: string[] = [];
    book.sheets.forEach((sh, si) => {
      const e = calc.shownExtent(si);
      if (!e.rows && book.sheets.length > 1) return;
      const rows = Math.min(e.rows, PRINT_ROWS);
      const width = Array.from({ length: e.cols }, (_, c) => sh.cols?.[c]?.w ?? COL_W).reduce((a, b) => a + b, 0);
      const land = width > 700;
      const fit = Math.min(1, (land ? 1030 : 700) / Math.max(1, width));
      const table = e.rows ? tableHtml(sh, si, calc, { rows, cols: e.cols, heads: false, sticky: false, k: 1, thead: headerRows(sh, si, calc), ink: '#000' }, cls) : '<p class="nb-note">This sheet is empty.</p>';
      const charts = sh.charts?.length ? `<div class="nb-charts">${chartsHtml(book, sh, si, calc, null)}</div>` : '';
      parts.push(
        `<section class="nb-sheet${land ? ' nb-land' : ''}"><h2>${esc(sh.name)}</h2><div${fit < 1 ? ` style="zoom:${fit.toFixed(3)}"` : ''}>${table}</div>${e.rows > rows ? `<p class="nb-note">The first ${rows.toLocaleString('en')} of ${e.rows.toLocaleString('en')} rows.</p>` : ''}${charts}</section>`,
      );
    });
    return `${head(PRINT_CSS + cls.css())}</style></head><body>${parts.join('')}</body></html>`;
  }
  const sections: string[] = [];
  book.sheets.forEach((sh, si) => {
    const e = calc.shownExtent(si);
    const rows = Math.min(e.rows, VIEW_ROWS);
    const cols = Math.min(e.cols, VIEW_COLS);
    // At least a screen's worth of empty grid, so a short sheet still looks like one.
    const table = tableHtml(sh, si, calc, { rows: Math.max(rows, Math.min(VIEW_ROWS, 20)), cols: Math.max(cols, Math.min(VIEW_COLS, 6)), heads: true, sticky: true, k: 1, thead: 0 }, cls);
    const charts = chartsHtml(book, sh, si, calc, { numW: NUM_W, head: HEAD_H, k: 1 });
    const more = e.rows > rows || e.cols > cols ? `<div class="nb-note">Showing the first ${rows.toLocaleString('en')} rows and ${cols} columns of ${e.rows.toLocaleString('en')} × ${e.cols}. Open it in the Library to see it all.</div>` : '';
    sections.push(`<section class="nb-sheet" data-i="${si}"${si ? ' hidden' : ''}><div class="nb-scroll">${table}${charts}</div>${more}</section>`);
  });
  const tabs =
    book.sheets.length > 1
      ? `<nav class="nb-tabs" role="tablist">${book.sheets.map((sh, si) => `<button type="button" role="tab" data-i="${si}" aria-selected="${si === 0}">${esc(sh.name)}</button>`).join('')}</nav>`
      : '';
  return `${head(VIEW_CSS + cls.css())}</style></head><body class="n-page nb-body"><div class="nb">${sections.join('')}${tabs}</div><script>${TABS_JS}</script></body></html>`;
}
