// Answer cards that read their data from a saved spreadsheet or a data file (shared/answer-ui/data-ref.ts says how a
// card names it and what it shows of it). The page drawing such a card asks here, with the card's data and the session
// (or the board) it is drawn in:
//   POST /api/answers/data   { ui, data, session?, board? } → { data, source, readAt, matched, rows, shown?, total?, notes }
// What a card may read:
// - A saved spreadsheet, by its id or name (the most recently changed of that name), a tab and a range (the
//   first row its headings), or a named range; but not one made in a confidential session, unless the card is drawn in
//   that session or in another confidential one (as get_page keeps them from other sessions' agents).
// - A CSV, TSV, JSON, JSONL or GeoJSON file in the session's folder or a folder of its project (the project's own, its
//   other folders and those of the projects a group brings in), by its path from the session's folder or in full; the
//   same folders its agent works in. Links that lead outside them do not count. A card drawn nowhere in particular
//   (the gallery) reads no files.
// How much: a file of up to 50 MB (a JSON file, read whole, 20 MB), the first 1,000,000 rows and 500 columns; what reaches
// the card is capped too (REF_LIMITS). A source read is kept a few minutes under its version (a spreadsheet's) or its
// size and time of change (a file's), and so is each card worked out from it, so a card drawn twice, or many cards of
// one source, read it once; a spreadsheet saved since, or a file changed, is read again.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { colName, computeBook, dateText, detectSep, formatValue, isError, parseRange, rangeName, refName, type Calc, type CellStyle, type Rect, type Workbook } from '../../shared/sheets.ts';
import { cleanHeadings, fieldCell, isDataRef, RefError, REF_LIMITS, REF_UIS, refSource, resolveRef, TableBuilder, type Cell, type ColHint, type DataTable, type RefSource, type Resolved } from '../../shared/answer-ui/data-ref.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { confidentialKey } from '../confidential/index.ts';
import { listPages, pageInfo, pageSource } from '../pages/store.ts';
import { readBook } from '../pages/sheets.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { spaceById, spaceOfSession } from '../spaces/index.ts';

/** Where a card is drawn: the session of its reply, or the board (a saved page) it is pinned to. */
export interface DrawnIn {
  session?: string;
  board?: string;
}

/** What a card is drawn with, and where it came from. */
export interface CardData extends Omit<Resolved, 'data'> {
  data: Record<string, unknown>;
  source: { kind: 'sheet'; id: string; name: string; tab: string; range: string; version: number } | { kind: 'file'; path: string; name: string; mtime: number };
  /** When the source was read (ms). */
  readAt: number;
  /** Rows the source holds (as far as read). */
  rows: number;
  /** Worked out before, and kept (for the tests). */
  cached?: boolean;
}

/** How long what was read, and what was worked out of it, is kept. */
export const KEEP_MS = 5 * 60_000;
/** The most cells kept at once, of every source together; the least recently used go first. */
const KEEP_CELLS = 5_000_000;
const KEEP_CARDS = 300;

// ---- where a card may read --------------------------------------------------------------------------------------------

interface Reader {
  /** The session it reads for (a board's: the one its card came from), and whether that is confidential. */
  session?: string;
  confidential: boolean;
  /** The folders its files may be in, as they really are (links followed). */
  roots: string[];
  /** Where a file's path starts from. */
  cwd: string | null;
}

const real = (p: string) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
};

/** A session's folder (its own, else the app's record of it). */
function cwdOf(db: DB, key: string): string | null {
  const r = db.prepare('select s.cwd as cwd, a.cwd as app_cwd from app_sessions a left join sessions s on s.key = a.key where a.key = ?').get(key) as { cwd: string | null; app_cwd: string | null } | undefined;
  if (r) return r.cwd ?? r.app_cwd;
  const s = db.prepare('select cwd from sessions where key = ?').get(key) as { cwd: string | null } | undefined;
  return s?.cwd ?? null;
}

/** A project's folders, and those of the projects its group brings in. */
function projectFolders(db: DB, spaceId: unknown): string[] {
  const sp = typeof spaceId === 'string' && spaceId ? spaceOfSession(db, { space: spaceId }) : null;
  if (!sp) return [];
  return [sp.space, ...sp.members].flatMap((s) => [s.folder, ...(s.folders ?? [])]).filter(Boolean);
}

/** Who reads, and where they may: the session's folder and its project's, or for a board its project's and its card's session's. */
export function readerFor(db: DB, at: DrawnIn): Reader {
  const folders: string[] = [];
  let session = typeof at.session === 'string' && at.session ? at.session : undefined;
  if (typeof at.board === 'string' && at.board) {
    const board = pageInfo(db, at.board);
    if (!board) throw new HttpError(404, 'That board is no longer there.');
    if (board.space && spaceById(db, board.space)) folders.push(...projectFolders(db, board.space));
    session ??= board.sessionKey;
  }
  let cwd: string | null = null;
  if (session) {
    cwd = cwdOf(db, session);
    if (cwd) folders.unshift(cwd);
    folders.push(...projectFolders(db, sessionExtra(db, session).space));
  }
  const roots = [...new Set(folders.map(real).filter((p): p is string => !!p))];
  return { session, confidential: !!session && confidentialKey(db, session), roots, cwd: cwd ?? roots[0] ?? null };
}

const inside = (root: string, p: string) => {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** A file a card names, as it really is, when it may read it; else why not. */
export function fileFor(reader: Reader, given: string): string {
  const s = given.trim();
  const raw = s === '~' || s.startsWith('~/') ? path.join(os.homedir(), s.slice(1)) : path.isAbsolute(s) ? s : reader.cwd ? path.resolve(reader.cwd, s) : null;
  if (!raw) throw new HttpError(403, 'A card reads files only in the conversation it belongs to (its session’s folder and its project’s).');
  const file = real(raw);
  if (!file) throw new HttpError(404, `There is no file ${raw}.`);
  if (!reader.roots.some((r) => inside(r, file))) throw new HttpError(403, `${path.basename(file)} is outside the folders this conversation works in (its own and its project’s), so the card does not read it.`);
  return file;
}

// ---- what is kept -------------------------------------------------------------------------------------------------------

interface Kept {
  table: DataTable;
  name: string;
  at: number;
  cells: number;
}

const tables = new Map<string, Kept>();
const reading = new Map<string, Promise<Kept>>();
const cards = new Map<string, { value: CardData; at: number }>();
const books = new Map<string, { book: Workbook; calc: Calc; at: number }>();

function sweep(now = Date.now()) {
  for (const [k, v] of tables) if (now - v.at > KEEP_MS) tables.delete(k);
  for (const [k, v] of cards) if (now - v.at > KEEP_MS) cards.delete(k);
  for (const [k, v] of books) if (now - v.at > KEEP_MS) books.delete(k);
  let cells = [...tables.values()].reduce((n, t) => n + t.cells, 0);
  // The least recently used first (a Map keeps the order things were put in; a use puts one back at the end).
  for (const [k, v] of tables) {
    if (cells <= KEEP_CELLS) break;
    tables.delete(k);
    cells -= v.cells;
  }
  while (cards.size > KEEP_CARDS) cards.delete(cards.keys().next().value!);
  while (books.size > 4) books.delete(books.keys().next().value!);
}

/** A source's table, read once while it is kept (and once for several asking at the same time). */
async function keptTable(key: string, read: () => Promise<{ table: DataTable; name: string }>): Promise<Kept> {
  const had = tables.get(key);
  if (had) {
    tables.delete(key);
    tables.set(key, had);
    return had;
  }
  let job = reading.get(key);
  if (!job) {
    job = read()
      .then(({ table, name }) => {
        const k: Kept = { table, name, at: Date.now(), cells: table.rows * Math.max(1, table.columns.length) };
        tables.set(key, k);
        sweep();
        return k;
      })
      .finally(() => reading.delete(key));
    reading.set(key, job);
  }
  return job;
}

/** For tests: forget everything kept. */
export function dropKept() {
  tables.clear();
  cards.clear();
  books.clear();
}

/** For tests: how many sources are kept. */
export const keptSources = () => tables.size;

// ---- spreadsheets ---------------------------------------------------------------------------------------------------------

/** The spreadsheet a card names: by its id, else by its name (in any case), the most recently changed of that name. */
function sheetPage(db: DB, name: string) {
  const byId = pageInfo(db, name);
  if (byId && !byId.app) {
    if (byId.kind !== 'sheet') throw new HttpError(400, `“${byId.title}” is not a spreadsheet.`);
    return byId;
  }
  const want = name.replace(/\s+/g, ' ').trim().toLowerCase();
  const all = listPages(db).filter((p) => p.title.replace(/\s+/g, ' ').trim().toLowerCase() === want);
  const sheet = all.find((p) => p.kind === 'sheet');
  if (sheet) return sheet;
  if (all.length) throw new HttpError(400, `“${all[0].title}” is not a spreadsheet.`);
  throw new HttpError(404, `There is no spreadsheet called “${name}”.`);
}

/** A cell's value for a card: numbers as numbers, dates and times as they are written (2026-01-31), errors as empty. */
function sheetCell(v: unknown, s: CellStyle | undefined): Cell {
  if (v === null || v === undefined || isError(v)) return null;
  if (typeof v === 'number') {
    if (s?.fmt === 'date' || s?.fmt === 'datetime') return dateText(v);
    if (s?.fmt === 'time' || s?.fmt === 'duration') return formatValue(v, s);
    return v;
  }
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  return null;
}

/** What a column's cells are, by the number format of its first value. */
function hintOf(s: CellStyle | undefined): ColHint | undefined {
  if (s?.fmt === 'currency' || s?.fmt === 'accounting') return { type: 'money', currency: s.cur ?? '$' };
  if (s?.fmt === 'percent') return { type: 'percent' };
  if (s?.fmt === 'date' || s?.fmt === 'datetime') return { type: 'date' };
  return undefined;
}

/** The tab and range a card names: "Sales!A1:D400", "A1:D400", "Sales", a named range, or `tab` beside a range. */
function placeIn(book: Workbook, calc: Calc, ref: RefSource, title: string): { si: number; rect: Rect } {
  let tab = ref.tab ?? '';
  let range = ref.range ?? '';
  const tabIndex = (n: string) => book.sheets.findIndex((s) => s.name.toLowerCase() === n.replace(/^'(.*)'$/, '$1').replace(/''/g, "'").trim().toLowerCase());
  // A named range (Data → Named ranges) stands for its cells.
  const named = range && !range.includes('!') ? book.names?.find((n) => n.name.toLowerCase() === range.toLowerCase() && !n.sheet) : undefined;
  if (named) range = named.ref.replace(/\$/g, '');
  const bang = range.lastIndexOf('!');
  if (bang > 0) {
    tab = range.slice(0, bang);
    range = range.slice(bang + 1);
  } else if (range && !parseRange(range) && tabIndex(range) >= 0) {
    tab = range;
    range = '';
  }
  const visible = book.sheets.findIndex((s) => !s.hidden);
  const si = tab ? tabIndex(tab) : visible >= 0 ? visible : 0;
  const tabs = book.sheets.map((s) => s.name).join(', ');
  if (si < 0) throw new HttpError(404, `“${title}” has no tab called “${tab}”. Its tabs: ${tabs}.`);
  const e = calc.shownExtent(si);
  if (!e.rows || !e.cols) throw new HttpError(404, `The tab “${book.sheets[si].name}” of “${title}” is empty.`);
  let rect: Rect = { r1: 0, c1: 0, r2: e.rows - 1, c2: e.cols - 1 };
  if (range) {
    const x = parseRange(range);
    if (!x) throw new HttpError(400, `“${range}” is not a range: write it as Sales!A1:D400, A1:D400 or A:D.`);
    rect = { r1: x.r1, c1: x.c1, r2: Math.min(x.r2, e.rows - 1), c2: Math.min(x.c2, e.cols - 1) };
    if (rect.r2 < rect.r1 || rect.c2 < rect.c1) throw new HttpError(404, `${range} of “${book.sheets[si].name}” in “${title}” is empty.`);
  }
  return { si, rect };
}

/** A tab's range as a table: its first row the headings, rows without anything in them left out. */
function sheetTable(book: Workbook, calc: Calc, si: number, rect: Rect): DataTable {
  const sh = book.sheets[si];
  const width = Math.min(rect.c2 - rect.c1 + 1, REF_LIMITS.columns);
  const heads: string[] = [];
  for (let c = 0; c < width; c++) heads.push(formatValue(calc.value(si, rect.r1, rect.c1 + c), sh.cells[refName(rect.r1, rect.c1 + c)]?.s));
  const b = new TableBuilder(cleanHeadings(heads, (i) => colName(rect.c1 + i)));
  const hinted = new Set<number>();
  for (let r = rect.r1 + 1; r <= rect.r2; r++) {
    const row: Cell[] = new Array(width);
    let any = false;
    for (let c = 0; c < width; c++) {
      const s = sh.cells[refName(r, rect.c1 + c)]?.s;
      const v = sheetCell(calc.value(si, r, rect.c1 + c), s);
      row[c] = v;
      if (v === null || v === '') continue;
      any = true;
      if (!hinted.has(c)) {
        hinted.add(c);
        const h = hintOf(s);
        if (h) b.hints[c] = h;
      }
    }
    if (any && !b.add(row)) break;
  }
  return b.done();
}

async function readSheet(db: DB, reader: Reader, ref: RefSource): Promise<{ kept: Kept; source: CardData['source'] }> {
  const page = sheetPage(db, ref.sheet!);
  // As get_page keeps a confidential session's pages from other sessions' agents.
  if (page.sessionKey && page.sessionKey !== reader.session && !reader.confidential && confidentialKey(db, page.sessionKey))
    throw new HttpError(403, `“${page.title}” was made in a confidential session: only cards in that session (or another confidential one) read it.`);
  const bookKey = `${page.id}:${page.version}`;
  let b = books.get(bookKey);
  if (!b) {
    const src = pageSource(db, page.id);
    if (!src || src.kind !== 'sheet') throw new HttpError(404, `“${page.title}” could not be read.`);
    const book = readBook(src.text);
    b = { book, calc: computeBook(book), at: Date.now() };
    books.set(bookKey, b);
    sweep();
  }
  const { si, rect } = placeIn(b.book, b.calc, ref, page.title);
  const tab = b.book.sheets[si].name;
  const book = b;
  const kept = await keptTable(`sheet:${bookKey}:${si}:${rangeName(rect)}`, async () => ({ table: sheetTable(book.book, book.calc, si, rect), name: `${page.title} · ${tab}` }));
  return { kept, source: { kind: 'sheet', id: page.id, name: page.title, tab, range: rangeName(rect), version: page.version } };
}

// ---- files ----------------------------------------------------------------------------------------------------------------

const tick = () => new Promise<void>((r) => setImmediate(r));
/** Rows read between letting other requests in. */
const CHUNK = 20_000;

/** Records of delimited text (RFC 4180 quotes, any line ends), one at a time. */
function* records(s: string, sep: string): Generator<string[]> {
  const n = s.length;
  let i = s.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    const row: string[] = [];
    for (;;) {
      if (s.charCodeAt(i) === 34) {
        let j = i + 1;
        let val = '';
        for (;;) {
          const q = s.indexOf('"', j);
          if (q < 0) {
            val += s.slice(j);
            j = n;
            break;
          }
          val += s.slice(j, q);
          if (s.charCodeAt(q + 1) === 34) {
            val += '"';
            j = q + 2;
            continue;
          }
          j = q + 1;
          break;
        }
        // Anything after the closing quote, up to the separator, joins the field (as spreadsheets read it).
        let k = j;
        while (k < n && s[k] !== sep && s[k] !== '\n' && s[k] !== '\r') k++;
        row.push(k > j ? val + s.slice(j, k) : val);
        i = k;
      } else {
        let k = i;
        while (k < n) {
          const c = s[k];
          if (c === sep || c === '\n' || c === '\r') break;
          k++;
        }
        row.push(s.slice(i, k));
        i = k;
      }
      if (i >= n) {
        yield row;
        return;
      }
      if (s[i] === sep) {
        i++;
        if (i >= n) {
          row.push('');
          yield row;
          return;
        }
        continue;
      }
      i += s[i] === '\r' && s[i + 1] === '\n' ? 2 : 1;
      yield row;
      break;
    }
  }
}

async function delimitedTable(text: string, sep: string): Promise<DataTable> {
  const it = records(text, sep);
  // The first line with anything in it holds the headings (read with next(): leaving a for…of would end the records).
  let head: string[] | undefined;
  for (let r = it.next(); !r.done; r = it.next())
    if (r.value.some((f) => f.trim())) {
      head = r.value;
      break;
    }
  if (!head) return { columns: [], rows: 0 };
  const b = new TableBuilder(cleanHeadings(head, colName));
  const hints: ColHint[] = b.hints;
  for (let i = 0; i < head.length; i++) hints[i] = {};
  let n = 0;
  for (const r of it) {
    if (r.length === 1 && !r[0].trim()) continue;
    const row: Cell[] = new Array(head.length);
    for (let c = 0; c < head.length; c++) row[c] = c < r.length ? fieldCell(r[c], hints[c]) : null;
    if (!b.add(row)) break;
    if (++n % CHUNK === 0) await tick();
  }
  return b.done();
}

/** A JSON value in a cell: numbers and words as they are (words written as numbers become numbers), anything else as JSON. */
const jsonCell = (v: unknown, hint?: ColHint): Cell => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return fieldCell(v, hint);
  const s = JSON.stringify(v);
  return s.length > 300 ? `${s.slice(0, 299)}…` : s;
};

/** An object's fields, those of objects inside it one level down too ("address.city"). */
function flat(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) out[`${k}.${k2}`] = v2;
    else out[k] = v;
  }
  return out;
}

/** A GeoJSON feature as a row: its properties, and a point's latitude and longitude. */
function featureRow(f: unknown): Record<string, unknown> | null {
  if (!f || typeof f !== 'object') return null;
  const x = f as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
  const c = x.geometry?.type === 'Point' && Array.isArray(x.geometry.coordinates) ? x.geometry.coordinates : null;
  return { ...(x.properties ?? {}), ...(c ? { lat: c[1], lng: c[0] } : {}) };
}

/** Rows of objects as a table: the headings those of its first 1,000 rows. */
async function objectsTable(rows: Iterable<unknown>): Promise<DataTable> {
  const list = Array.isArray(rows) ? rows : [...rows];
  const keys = new Set<string>();
  for (const r of list.slice(0, 1000)) if (r && typeof r === 'object' && !Array.isArray(r)) for (const k of Object.keys(flat(r as Record<string, unknown>))) keys.add(k);
  const head = [...keys];
  const b = new TableBuilder(cleanHeadings(head, colName));
  for (let i = 0; i < head.length; i++) b.hints[i] = {};
  let n = 0;
  for (const r of list) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const o = flat(r as Record<string, unknown>);
    if (!b.add(head.map((k, i) => jsonCell(o[k], b.hints[i])))) break;
    if (++n % CHUNK === 0) await tick();
  }
  return b.done();
}

/** A JSON file's rows: a list of objects (or of rows, the first the headings), a list inside an object, columns of equal length, or GeoJSON. */
async function jsonTable(text: string, file: string): Promise<DataTable> {
  let v: unknown;
  try {
    v = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new HttpError(400, `${path.basename(file)} is not JSON a card can read: ${(e as Error).message}`);
  }
  const fail = () => new HttpError(400, `${path.basename(file)} holds no rows: a card reads a list of objects, a list of rows (the first its headings), an object holding such a list, or GeoJSON.`);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (o.type === 'FeatureCollection' && Array.isArray(o.features)) return objectsTable(o.features.map(featureRow));
    const list = Object.values(o).find((x) => Array.isArray(x) && x.some((y) => y && typeof y === 'object'));
    if (list) v = list;
    else {
      // Columns: { "month": [...], "revenue": [...] }.
      const cols = Object.entries(o).filter(([, x]) => Array.isArray(x)) as [string, unknown[]][];
      const n = cols.length ? Math.max(...cols.map(([, x]) => x.length)) : 0;
      if (!n) throw fail();
      return objectsTable(Array.from({ length: Math.min(n, REF_LIMITS.rows + 1) }, (_, i) => Object.fromEntries(cols.map(([k, x]) => [k, x[i]]))));
    }
  }
  if (!Array.isArray(v) || !v.length) throw fail();
  if (Array.isArray(v[0])) {
    const head = (v[0] as unknown[]).map((h) => String(h ?? ''));
    return objectsTable(v.slice(1).map((r) => (Array.isArray(r) ? Object.fromEntries(head.map((h, i) => [h || colName(i), r[i]])) : null)));
  }
  return objectsTable(v);
}

/** A JSON Lines file's rows, an object a line (lines that are not one are left out). */
async function jsonlTable(text: string): Promise<DataTable> {
  const rows: unknown[] = [];
  let at = 0;
  while (at < text.length && rows.length <= REF_LIMITS.rows) {
    let end = text.indexOf('\n', at);
    if (end < 0) end = text.length;
    const line = text.slice(at, end).trim();
    at = end + 1;
    if (!line) continue;
    try {
      rows.push(JSON.parse(line.replace(/^﻿/, '')));
    } catch {}
    if (rows.length % CHUNK === 0) await tick();
  }
  return objectsTable(rows);
}

const KINDS: Record<string, 'csv' | 'tsv' | 'json' | 'jsonl'> = { '.csv': 'csv', '.txt': 'csv', '.tsv': 'tsv', '.tab': 'tsv', '.json': 'json', '.geojson': 'json', '.jsonl': 'jsonl', '.ndjson': 'jsonl' };

async function readFileRef(reader: Reader, given: string): Promise<{ kept: Kept; source: CardData['source'] }> {
  const file = fileFor(reader, given);
  const kind = KINDS[path.extname(file).toLowerCase()];
  if (!kind) throw new HttpError(400, `${path.basename(file)} is not a file a card reads: give a CSV, TSV, JSON or JSONL file (or a saved spreadsheet).`);
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, `There is no file ${given}.`);
  const max = kind === 'json' ? REF_LIMITS.jsonBytes : REF_LIMITS.fileBytes;
  if (st.size > max) {
    const mb = (st.size / 1048576).toFixed(1);
    if (kind === 'json') throw new HttpError(413, `${path.basename(file)} is ${mb} MB: a card reads a JSON file of up to 20 MB, or JSON Lines of up to 50 MB. Save a part or a summary of it, or put it in a spreadsheet.`);
    throw new HttpError(413, `${path.basename(file)} is ${mb} MB: a card reads a file of up to 50 MB. Save a part or a summary of it, or put it in a spreadsheet.`);
  }
  const kept = await keptTable(`file:${file}:${st.size}:${st.mtimeMs}`, async () => {
    const buf = await fs.promises.readFile(file);
    if (buf.subarray(0, 8000).includes(0)) throw new HttpError(400, `${path.basename(file)} is not text.`);
    const text = buf.toString('utf8');
    const table = kind === 'json' ? await jsonTable(text, file) : kind === 'jsonl' ? await jsonlTable(text) : await delimitedTable(text, kind === 'tsv' ? '\t' : detectSep(text.slice(0, 65536)));
    return { table, name: path.basename(file) };
  });
  return { kept, source: { kind: 'file', path: file, name: path.basename(file), mtime: Math.floor(st.mtimeMs) } };
}

// ---- a card ---------------------------------------------------------------------------------------------------------------

/** A card's data worked out from its source, as the card draws it; an HttpError a person can act on when it cannot be. */
export async function cardData(db: DB, ui: string, data: unknown, at: DrawnIn): Promise<CardData> {
  if (!REF_UIS.has(ui)) throw new HttpError(400, `The ${ui || 'unnamed'} card cannot read from a spreadsheet or a file: those that can are ${[...REF_UIS].join(', ')}.`);
  if (!isDataRef(data)) throw new HttpError(400, 'The card names no source: from: { "sheet": "Name", "range": "Tab!A1:D400" } or { "file": "data/sales.csv" }.');
  const d = data as Record<string, unknown>;
  const ref = refSource(d.from)!;
  const reader = readerFor(db, at);
  const got = ref.file ? await readFileRef(reader, ref.file) : await readSheet(db, reader, ref);
  const srcKey = got.source.kind === 'sheet' ? `${got.source.id}:${got.source.version}:${got.source.tab}:${got.source.range}` : `${got.source.path}:${got.source.mtime}`;
  const key = `${ui}\u0001${srcKey}\u0001${got.kept.at}\u0001${JSON.stringify(d)}`;
  const had = cards.get(key);
  if (had) return { ...had.value, cached: true };
  let r: Resolved;
  try {
    r = resolveRef(ui, d, got.kept.table, got.kept.name);
  } catch (e) {
    if (e instanceof RefError) throw new HttpError(400, e.message);
    throw e;
  }
  const value: CardData = { ...r, source: got.source, readAt: got.kept.at, rows: got.kept.table.rows };
  cards.set(key, { value, at: Date.now() });
  sweep();
  return value;
}

export function dataRoutes(d: Deps) {
  d.app.post('/api/answers/data', { bodyLimit: 256 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as { ui?: unknown; data?: unknown; session?: unknown; board?: unknown };
    const ui = typeof b.ui === 'string' ? b.ui.trim().toLowerCase() : '';
    return cardData(d.db, ui, b.data, { session: typeof b.session === 'string' ? b.session : undefined, board: typeof b.board === 'string' ? b.board : undefined });
  });
}
