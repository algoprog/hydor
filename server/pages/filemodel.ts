// Files of this computer opened in Pages' editors: Files opens a Word document (.docx) in the document editor, a
// spreadsheet (.xlsx, .csv, .tsv) in the spreadsheet editor and a LaTeX file (.tex) in the LaTeX editor, with the files
// it reads from its folder and the comments the app keeps on them (filecomments.ts); Save writes what the editor holds
// back to the same file, in its own format, and keeps the comments.
//
// Writing back keeps what it can of the file as it was. A CSV's rows and cells nobody changed keep their text exactly
// (its separator, quotes, line ends, encoding and byte-order mark too); a LaTeX project writes only the files that
// changed, each with its own line ends. A Word or Excel file is made again from the model: what the editor does not
// hold (a Word file's headers and footers, an Excel file's charts…) is said when it opens (`loses`), and the first save
// over it puts the file as it was in the trash (`backup`). A file the editor could not take in whole (`cut`) opens to
// be read only.
//
//   GET /api/pages/file?path=   PUT /api/pages/file { path, model, mtime, force?, backup?, copy?, tex? }
//   GET /api/pages/file/comments?path= (a LaTeX project's comments, read again when an agent changed them)
import { isUtf8 } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { editorKindOf, type FileOpened, type FileSaved } from '../../shared/documents.ts';
import { docSources } from '../../shared/docs.ts';
import { cleanEngine, cleanTexName, extOf, normalizeTex, TEX_FILE_EXT, TEX_LIMITS, TEX_MAIN, uncommented, type TexComment, type TexDoc } from '../../shared/latex.ts';
import { cellsFromRows, computeBook, detectSep, formatValue, normalizeBook, parseRef, refName, type Cell, type Workbook } from '../../shared/sheets.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { deletePath, resolvePath, trashCopy, writeFile } from '../files.ts';
import { getAsset } from './assets.ts';
import { docFromFile, docxOfDoc, keepDoc, readDoc, wordLosses } from './docs.ts';
import { projectComments, saveProjectComments } from './filecomments.ts';
import { pictureFor } from './export.ts';
import { texCommentOps, texCommentsForAgent, texFolderOk, textOf } from './latex.ts';
import type { Picture } from './pptx.ts';
import { decodeText, importBook, keepBook, readBook, xlsxOfBook } from './sheets.ts';

/** The largest file opened in an editor (each editor's model has limits of its own besides). */
const MAX_FILE = 60 * 1024 * 1024;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const mtimeOf = (st: fs.Stats) => Math.floor(st.mtimeMs);

/** A file as its editor's model, with what saving it again would lose. */
export async function openFile(db: DB, fileIn: string): Promise<FileOpened> {
  const file = resolvePath(fileIn);
  const kind = editorKindOf(file);
  if (!kind) throw new HttpError(415, 'This kind of file opens as text or a preview, not in an editor');
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, `Not found: ${file}`);
  if (st.size > MAX_FILE) throw new HttpError(413, `It is over ${MAX_FILE / 1024 / 1024} MB, too large for the editor`);
  const buf = await fs.promises.readFile(file);
  const base = { kind, path: file, mtime: mtimeOf(st), notes: [] as string[] };
  try {
    if (kind === 'doc') {
      const doc = readDoc(keepDoc(db, docFromFile(buf, path.basename(file))).text);
      return { ...base, model: doc, ...wordLosses(buf, doc) };
    }
    if (kind === 'sheet') {
      const got = importBook(buf, path.basename(file));
      return { ...base, model: readBook(keepBook(got.book).text), loses: got.loses ?? [], cut: got.cut, notes: got.notes };
    }
    const proj = texProject(file, buf);
    // Its comments, kept by the app beside the files (a file keeps only its text).
    const doc = proj.model as TexDoc;
    const comments = projectComments(db, doc, proj.tex!.folder, proj.tex!.main);
    if (comments.length) doc.comments = comments;
    return { ...base, ...proj };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, `The editor cannot read it: ${(e as Error).message}`);
  }
}

/**
 * The editor's model written to the file it came from (or, with `copy`, to "name (edited).ext" beside it): refused
 * (409) when the file changed since `mtime`, unless `force`. `backup`: the file as it was goes to the trash first.
 */
export async function saveFile(db: DB, b: Obj): Promise<FileSaved> {
  const file = resolvePath(typeof b.path === 'string' ? b.path : '');
  const kind = editorKindOf(file);
  if (!kind) throw new HttpError(415, 'This kind of file is not saved from an editor');
  if (kind === 'tex') return saveTex(db, file, b);
  const ext = path.extname(file).slice(1).toLowerCase();
  const st = fs.statSync(file, { throwIfNoEntry: false });
  const copy = b.copy === true;
  if (!copy && st && b.force !== true && typeof b.mtime === 'number' && mtimeOf(st) !== b.mtime) throw new HttpError(409, 'The file changed on disk since you opened it');
  const title = path.basename(file).replace(/\.[^.]+$/, '');
  let data: Buffer;
  let dropped: string[] = [];
  if (kind === 'doc') {
    const { doc, text } = keepDoc(db, b.model);
    const pics = new Map<string, Picture | null>();
    for (const s of new Set(docSources(doc))) pics.set(s, await pictureFor(db, s));
    data = docxOfDoc(db, readDoc(text), title, (s) => pics.get(s) ?? null);
  } else {
    const book = readBook(keepBook(b.model).text);
    if (ext === 'xlsx') data = xlsxOfBook(book, title);
    else ({ data, dropped } = delimitedFile(book, st?.isFile() ? fs.readFileSync(file) : null, ext));
  }
  const to = copy ? copyName(file) : file;
  const backup = !copy && b.backup === true && st?.isFile() ? await trashCopy(file) : undefined;
  const w = await writeFile(to, data, { create: copy });
  return { path: w.path, mtime: w.mtime, size: w.size, backup, dropped };
}

/** "report (edited).docx" beside a file, or "report (edited 2).docx" and so on. */
function copyName(file: string): string {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  for (let i = 1; i < 1000; i++) {
    const p = path.join(dir, `${stem} (edited${i > 1 ? ` ${i}` : ''})${ext}`);
    if (!fs.existsSync(p)) return p;
  }
  throw new HttpError(409, 'No free name for a copy there');
}

// ---- delimited text (CSV, TSV) --------------------------------------------------------------------------------------

type Encoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be' | 'cp1252';

/** How a text file is written, as decodeText reads it. */
function encodingOf(buf: Buffer): Encoding {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8bom';
  if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le';
  if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf16be';
  return isUtf8(buf) ? 'utf8' : 'cp1252';
}

/** Windows' Western encoding's characters for its bytes 0x80 to 0x9f (the rest are Latin-1's). */
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

function encode(s: string, enc: Encoding): Buffer {
  if (enc === 'utf8bom') return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, 'utf8')]);
  if (enc === 'utf16le') return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
  if (enc === 'utf16be') return Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(s, 'utf16le').swap16()]);
  if (enc === 'cp1252') {
    const out = Buffer.alloc(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      const k = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : 0x80 + CP1252.indexOf(s[i]);
      // A character the encoding has no byte for: the whole file becomes UTF-8.
      if (k < 0x80 && c >= 0x80) return Buffer.from(s, 'utf8');
      out[i] = k;
    }
    return out;
  }
  return Buffer.from(s, 'utf8');
}

/** Delimited text's rows as parseDelimited reads them, with where each row's text is (its line end left out). */
function rowsWithSpans(text: string, sep: string): { rows: string[][]; spans: [number, number][] } {
  const rows: string[][] = [];
  const spans: [number, number][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') (field += '"'), i++;
        else q = false;
      } else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === sep) row.push(field), (field = '');
    else if (ch === '\n' || ch === '\r') {
      const end = i;
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      spans.push([start, end]);
      row = [];
      start = i + 1;
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
    spans.push([start, text.length]);
  }
  // Blank lines at the end make no rows (they stay as they were, after the last one).
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop(), spans.pop();
  return { rows, spans };
}

const cellKey = (c: Cell | undefined) =>
  c && (c.v !== undefined || c.f !== undefined || c.s) ? JSON.stringify([c.f ?? null, c.v ?? null, c.s ? Object.entries(c.s).sort(([a], [b]) => (a < b ? -1 : 1)) : null]) : '';
const holds = (c: Cell | undefined) => !!c && (c.v !== undefined || c.f !== undefined);

/** A sheet's cells by row, then column. */
function byRow(cells: Record<string, Cell>): Map<number, Map<number, Cell>> {
  const out = new Map<number, Map<number, Cell>>();
  for (const [ref, cell] of Object.entries(cells)) {
    const p = parseRef(ref);
    if (!p) continue;
    let row = out.get(p.r);
    if (!row) out.set(p.r, (row = new Map()));
    row.set(p.c, cell);
  }
  return out;
}

const rowKey = (row: Map<number, Cell> | undefined) =>
  row
    ? JSON.stringify(
        [...row.entries()]
          .filter(([, c]) => cellKey(c))
          .sort((a, b) => a[0] - b[0])
          .map(([c, cell]) => [c, cellKey(cell)]),
      )
    : '[]';

/**
 * A workbook's first sheet as the delimited file it came from (`original`, as it is on disk now): each row nobody
 * changed as its line was (where it was, or where it moved to), each cell nobody changed as its text was, the
 * others as their cells show them (a formula's value); in the file's separator, line ends and encoding. What a
 * delimited file cannot keep is in `dropped`.
 */
export function delimitedFile(book: Workbook, original: Buffer | null, ext: string): { data: Buffer; dropped: string[] } {
  const enc = original ? encodingOf(original) : 'utf8';
  const text = original ? decodeText(original) : '';
  const sep = ext === 'tsv' ? '\t' : text ? detectSep(text) : ',';
  const eol = /\r\n|\n|\r/.exec(text)?.[0] ?? '\n';
  const { rows: was, spans } = rowsWithSpans(text, sep);
  const tail = was.length ? text.slice(spans[spans.length - 1][1]) : eol;
  // The cells as they came in (as the file is typed when it opens), to tell the ones nobody changed.
  const before = byRow(normalizeBook({ sheets: [{ name: 'Sheet 1', base: { cells: cellsFromRows(was, [], sep === ';') } }] }).sheets[0].cells);
  const sheet = book.sheets[0];
  const now = byRow(sheet.cells);
  const calc = computeBook(book);
  // What array formulas spilled goes in as the values it is, in the cells it fills (with their formula's look).
  for (const { r, c, sp } of calc.spillsOf(0))
    for (let i = 0; i < sp.h; i++)
      for (let j = 0; j < sp.w; j++) {
        const got = sp.d[i * sp.w + j];
        if ((!i && !j) || got === null || holds(now.get(r + i)?.get(c + j))) continue;
        // An error spilled (#N/A) is written as its code.
        const v = typeof got === 'object' ? got.code : got;
        let row = now.get(r + i);
        if (!row) now.set(r + i, (row = new Map()));
        const s = sheet.cells[refName(r, c)]?.s;
        row.set(c + j, s ? { v, s } : { v });
      }
  const keys = was.map((_, r) => rowKey(before.get(r)));
  const like = new Map<string, number[]>();
  keys.forEach((k, r) => k !== '[]' && (like.get(k) ?? like.set(k, []).get(k)!).push(r));
  const used = new Set<number>();
  const widths = was.map((r) => r.length);
  let cols = 0;
  for (const row of now.values()) for (const [c, cell] of row) if (holds(cell)) cols = Math.max(cols, c + 1);
  // A file whose rows all have as many fields stays so; a ragged one keeps each row's own.
  const even = widths.length > 0 && widths.every((w) => w === widths[0]) ? Math.max(widths[0], cols) : 0;
  const quote = (s: string) => (/["\r\n]/.test(s) || s.includes(sep) || (sep !== '\t' && /^\s|\s$/.test(s)) ? `"${s.replace(/"/g, '""')}"` : s);
  // A file split by ; writes numbers as it reads them: with a decimal comma (1.234,50).
  const shown = (r: number, c: number, cell: Cell) => {
    const v = calc.value(0, r, c);
    const s = formatValue(v, cell.s);
    return sep === ';' && typeof v === 'number' ? s.replace(/[.,]/g, (ch) => (ch === '.' ? ',' : '.')) : s;
  };
  const lines: string[] = [];
  const rows = Math.max(-1, ...now.keys()) + 1;
  for (let r = 0; r < rows; r++) {
    const row = now.get(r);
    const k = rowKey(row);
    let from = r < was.length && keys[r] === k && !used.has(r) ? r : undefined;
    if (from === undefined && k !== '[]') from = like.get(k)?.find((i) => !used.has(i));
    if (from !== undefined) {
      used.add(from);
      lines.push(text.slice(spans[from][0], spans[from][1]) + (even > widths[from] ? sep.repeat(even - widths[from]) : ''));
      continue;
    }
    const same = r < was.length ? before.get(r) : undefined;
    let last = -1;
    if (row) for (const [c, cell] of row) if (holds(cell)) last = Math.max(last, c);
    const width = even || Math.max(last + 1, r < was.length ? widths[r] : 0);
    const fields: string[] = [];
    for (let c = 0; c < width; c++) {
      const cell = row?.get(c);
      if (!holds(cell)) fields.push('');
      else if (same && was[r][c] !== undefined && cellKey(same.get(c)) === cellKey(cell)) fields.push(quote(was[r][c]));
      else fields.push(quote(shown(r, c, cell!)));
    }
    lines.push(fields.join(sep));
  }
  const dropped: string[] = [];
  if (book.sheets.length > 1) dropped.push('sheets');
  const all = Object.values(sheet.cells);
  if (all.some((c) => c.f !== undefined)) dropped.push('formulas');
  if (all.some((c) => c.s && Object.keys(c.s).some((x) => !['fmt', 'dp', 'cur'].includes(x)))) dropped.push('formatting');
  return { data: encode(lines.length ? lines.join(eol) + tail : '', enc), dropped };
}

// ---- LaTeX: a file and the files it reads from its folder -----------------------------------------------------------

/** The files of a project shown in the editor's tabs: what is written (chapters, a bibliography); the rest is typeset from the folder. */
const TAB_EXT = ['tex', 'ltx', 'bib', 'tikz', 'pgf'];
/** Where its folder cannot be read beside it, its styles and data come into the editor too. */
const ALL_EXT = TEX_FILE_EXT;
const MAINS = ['main.tex', 'paper.tex', 'thesis.tex', 'report.tex', 'article.tex', 'document.tex', 'ms.tex', 'manuscript.tex'];

const source = (s: string) => s.split('\n').map(uncommented).join('\n');
const isWhole = (s: string) => {
  const t = source(s);
  return /\\documentclass/.test(t) && /\\begin\s*\{document\}/.test(t);
};

/** Names a source may read files by: its commands' arguments in braces, each split at commas (\input{a}, \bibliography{a,b}, \import{dir}{a}), and \input's bare one. */
function namesIn(text: string): string[] {
  const src = source(text);
  const out = new Set<string>();
  const add = (s: string) => {
    for (const part of s.split(',')) {
      const n = part.trim().replace(/^"(.*)"$/, '$1').trim().replace(/^(\.\/)+/, '');
      if (n && n.length < 200 && !/[\\#$%&~^{}]/.test(n)) out.add(n);
    }
  };
  for (const m of src.matchAll(/\\[A-Za-z@]+\*?\s*(?:\[[^\]\n]*\]\s*)*\{([^{}\n]*)\}(?:\s*\{([^{}\n]*)\})?/g)) {
    add(m[1]);
    if (m[2] !== undefined) {
      add(m[2]);
      if (!/[\\,]/.test(m[1]) && !/[\\,]/.test(m[2])) add(`${m[1].trim().replace(/\/?$/, '/')}${m[2].trim()}`);
    }
  }
  for (const m of src.matchAll(/\\input\s+([^\s{}\\%]+)/g)) add(m[1]);
  return [...out];
}

interface Found {
  abs: string;
  text: string;
  mtime: number;
}

/** The files a document reads from its folder (`exts`, by its sources' names, the files read in turn too), at most as a document may have. */
function projectFiles(folder: string, mainFile: string, mainText: string, exts: string[], notes: string[]): Map<string, Found> {
  const found = new Map<string, Found>();
  let total = Buffer.byteLength(mainText);
  let full = false;
  const resolve = (n: string): string | null => {
    for (const cand of [n, ...['tex', 'bib', 'sty', 'cls', 'bst'].map((e) => `${n}.${e}`)]) {
      if (!exts.includes(extOf(cand))) continue;
      const abs = path.resolve(folder, cand);
      if (!abs.startsWith(folder + path.sep)) continue;
      if (fs.statSync(abs, { throwIfNoEntry: false })?.isFile()) return abs;
    }
    return null;
  };
  const queue = [mainText];
  while (queue.length) {
    for (const n of namesIn(queue.shift()!)) {
      const abs = resolve(n);
      if (!abs || abs === mainFile) continue;
      const rel = path.relative(folder, abs).split(path.sep).join('/');
      // A file named main.tex beside a document of another name: TeX reads the document's own main.tex by that name.
      if (found.has(rel) || cleanTexName(rel, 'file') !== rel || rel === TEX_MAIN) continue;
      const st = fs.statSync(abs);
      if (st.size > TEX_LIMITS.file || found.size >= TEX_LIMITS.files || total + st.size > TEX_LIMITS.total) {
        if (!full) notes.push(`Not every file it reads is in the editor (a document there may have ${TEX_LIMITS.files} files, ${TEX_LIMITS.total / 1024 / 1024} MB in all): the others are typeset from the folder as they are.`);
        full = true;
        continue;
      }
      const text = textOf(fs.readFileSync(abs));
      total += st.size;
      found.set(rel, { abs, text, mtime: mtimeOf(st) });
      if (/\.(tex|ltx)$/i.test(rel)) queue.push(text);
    }
  }
  return found;
}

/** The document a part of it belongs to (a chapter's): one in its folder or a folder or two up that reads it. */
function findMain(file: string): { file: string; text: string } | null {
  const home = os.homedir();
  let dir = path.dirname(file);
  for (let up = 0; up < 3 && dir !== home && dir !== path.parse(dir).root; up++, dir = path.dirname(dir)) {
    let names: string[];
    try {
      names = fs.readdirSync(dir).filter((n) => /\.(tex|ltx)$/i.test(n) && !n.startsWith('.'));
    } catch {
      continue;
    }
    const rank = (n: string) => (MAINS.includes(n.toLowerCase()) ? MAINS.indexOf(n.toLowerCase()) : 99);
    for (const n of names.sort((a, b) => rank(a) - rank(b)).slice(0, 60)) {
      const abs = path.join(dir, n);
      if (abs === file) continue;
      const st = fs.statSync(abs, { throwIfNoEntry: false });
      if (!st?.isFile() || st.size > TEX_LIMITS.main) continue;
      const text = textOf(fs.readFileSync(abs));
      if (isWhole(text) && [...projectFiles(dir, abs, text, ['tex', 'ltx'], []).values()].some((f) => f.abs === file)) return { file: abs, text };
    }
  }
  return null;
}

/** A LaTeX file as the editor's project: the document (the file, or the one that reads it) and what it reads from its folder. */
function texProject(file: string, buf: Buffer): Pick<FileOpened, 'model' | 'loses' | 'notes' | 'tex'> {
  const text = textOf(buf);
  let main = { file, text };
  if (!isWhole(text)) {
    const found = findMain(file);
    if (!found) throw new HttpError(415, 'This .tex file is not a whole document, and no document beside it reads it');
    main = found;
  }
  const folder = path.dirname(main.file);
  const inFolder = texFolderOk(folder);
  const notes: string[] = [];
  const files = projectFiles(folder, main.file, main.text, inFolder ? TAB_EXT : ALL_EXT, notes);
  const rel = (abs: string) => path.relative(folder, abs).split(path.sep).join('/');
  // An engine the file asks for (% !TEX program = xelatex), else the one its preamble wants.
  const asked = /^\s*%\s*!\s*TEX\s+(?:TS-)?program\s*=\s*([A-Za-z]+)/im.exec(main.text.slice(0, 4000))?.[1];
  const doc: TexDoc = normalizeTex({ main: main.text, files: [...files].map(([name, f]) => ({ name, text: f.text })), engine: cleanEngine(asked) ?? undefined });
  const times: Record<string, number> = { [rel(main.file)]: mtimeOf(fs.statSync(main.file)) };
  for (const [name, f] of files) times[name] = f.mtime;
  const open = file === main.file ? TEX_MAIN : rel(file);
  if (!inFolder) notes.push('Its folder is not one TeX may read beside it (the home folder, say): its pictures are not typeset with it.');
  return { model: doc, loses: [], notes, tex: { folder, main: rel(main.file), open: files.has(open) || open === TEX_MAIN ? open : TEX_MAIN, files: times, inFolder } };
}

/** Text as the LaTeX editor keeps it (shared/latex.ts cleanText): to tell whether a file on disk says the same. */
const asKept = (s: string) => s.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/g, '');

/** A file's new text written as the file was: its line ends, byte-order mark, and Latin-1 when it was not UTF-8. */
function likeBefore(old: Buffer | null, text: string): Buffer {
  if (!old) return Buffer.from(text, 'utf8');
  const was = textOf(old);
  const s = /\r\n/.test(was) ? text.replace(/\n/g, '\r\n') : text;
  if (old[0] === 0xef && old[1] === 0xbb && old[2] === 0xbf) return Buffer.concat([old.subarray(0, 3), Buffer.from(s.replace(/^﻿/, ''), 'utf8')]);
  if (!isUtf8(old) && !/[^\u0000-ÿ]/.test(s)) return Buffer.from(s, 'latin1');
  return Buffer.from(s, 'utf8');
}

/**
 * A LaTeX project saved into its folder: the files that changed (main.tex as the document's own file), new files
 * and pictures added in the editor; files the editor removed go to the trash. A file that changed on disk since it
 * was opened (`tex.files`, its time then), or a new one whose name is taken there, is not written over unless `force`.
 */
async function saveTex(db: DB, file: string, b: Obj): Promise<FileSaved> {
  const t = isObj(b.tex) ? b.tex : {};
  const folder = resolvePath(typeof t.folder === 'string' ? t.folder : '');
  if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) throw new HttpError(404, `There is no folder ${folder}`);
  const mainRel = typeof t.main === 'string' ? cleanTexName(t.main, 'file') : null;
  if (!mainRel || !/\.(tex|ltx)$/i.test(mainRel)) throw new HttpError(400, 'Which is the document’s main file (tex.main)?');
  const was: Record<string, number> = isObj(t.files) ? Object.fromEntries(Object.entries(t.files).filter((e): e is [string, number] => typeof e[1] === 'number')) : {};
  let doc: TexDoc;
  try {
    doc = normalizeTex(b.model);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const at = (rel: string) => {
    const p = path.resolve(folder, rel);
    if (!p.startsWith(folder + path.sep)) throw new HttpError(400, `Unsafe name ${rel}`);
    return p;
  };
  const force = b.force === true;
  const texts: [string, string][] = [[mainRel, doc.main], ...doc.files.map((f) => [f.name, f.text] as [string, string])];
  if (doc.files.some((f) => f.name.toLowerCase() === mainRel.toLowerCase())) throw new HttpError(400, `${mainRel} is the document’s own file: name the other one differently`);
  const writes: { abs: string; data: Buffer }[] = [];
  const taken: string[] = [];
  for (const [rel, text] of texts) {
    const abs = at(rel);
    const st = fs.statSync(abs, { throwIfNoEntry: false });
    if (st && !st.isFile()) throw new HttpError(409, `${rel} is a folder`);
    const old = st ? fs.readFileSync(abs) : null;
    if (old && asKept(textOf(old)) === text) continue;
    if (st && !force && mtimeOf(st) !== was[rel]) {
      taken.push(rel);
      continue;
    }
    writes.push({ abs, data: likeBefore(old, text) });
  }
  for (const p of doc.pictures) {
    const abs = at(p.name);
    const data = p.src.startsWith('naget-asset:') ? getAsset(db, p.src.slice('naget-asset:'.length))?.data : Buffer.from(p.src.replace(/^data:[^,]*,/, ''), 'base64');
    if (!data) continue;
    const st = fs.statSync(abs, { throwIfNoEntry: false });
    if (st?.isFile() && fs.readFileSync(abs).equals(data)) continue;
    // A picture added in the editor under the name of one in the folder: not written over it unless asked.
    if (st && !force) {
      taken.push(p.name);
      continue;
    }
    writes.push({ abs, data });
  }
  if (taken.length) throw new HttpError(409, `${taken.join(', ')} changed on disk since you opened it, or is new there`);
  for (const w of writes) await writeFile(w.abs, w.data, {});
  // Files the editor no longer has (removed, or renamed): to the trash, when they are as they were opened.
  const kept = new Set(texts.map(([rel]) => rel));
  for (const rel of Object.keys(was)) {
    if (rel === mainRel || kept.has(rel) || cleanTexName(rel, 'file') !== rel) continue;
    const abs = at(rel);
    const st = fs.statSync(abs, { throwIfNoEntry: false });
    if (st?.isFile() && mtimeOf(st) === was[rel]) await deletePath(abs).catch(() => {});
  }
  const files: Record<string, number> = {};
  for (const [rel] of texts) {
    const st = fs.statSync(at(rel), { throwIfNoEntry: false });
    if (st) files[rel] = mtimeOf(st);
  }
  // The comments, by each file's path: the editor's, with what an agent did since it had them (`tex.comments`).
  const comments = saveProjectComments(db, doc, folder, mainRel, t.comments, Object.keys(was));
  const shown = fs.existsSync(file) ? file : at(mainRel);
  const st = fs.statSync(shown);
  return { path: shown, mtime: mtimeOf(st), size: st.size, files, dropped: [], comments };
}

/**
 * What get_page tells an agent of a LaTeX file of this computer: its project (the document and the files it reads),
 * and the comments the user wrote on their words, which the app keeps beside them, with how to answer them. The
 * files themselves the agent reads and changes with its own tools.
 */
export async function texFileForAgent(db: DB, fileIn: string): Promise<string> {
  const f = await openFile(db, fileIn);
  if (f.kind !== 'tex' || !f.tex) throw new HttpError(415, 'Only a LaTeX file (.tex) has comments kept by the app.');
  const d = f.model as TexDoc;
  const t = f.tex;
  const real = (n: string) => (n === TEX_MAIN ? t.main : n);
  const head = `${f.path}: a LaTeX file of this computer${path.join(t.folder, t.main) !== f.path ? `, read by ${path.join(t.folder, t.main)}` : ''}. Its project's files, in ${t.folder}: ${[t.main, ...d.files.map((x) => x.name)].join(', ')}. Read and change them with your own tools; the comments the user wrote on their words are kept by the app, and listed here.`;
  return d.comments?.length ? `${head}\n\n${texCommentsForAgent(d, 'save_latex’s path and comments', real)}` : `${head}\n\nIt has no comments.`;
}

/**
 * An agent's answers to a LaTeX file's comments (save_latex with its path): replies, resolutions and new comments on
 * the words of the project's files, kept by the app; the files themselves are not written. Returns what to tell the
 * agent, and the files whose comments an open editor takes in again.
 */
export async function agentFileComments(db: DB, fileIn: string, ops: unknown): Promise<{ text: string; paths: string[] }> {
  const f = await openFile(db, fileIn);
  if (f.kind !== 'tex' || !f.tex) throw new HttpError(415, 'Only a LaTeX file (.tex) has comments kept by the app: edit other files with your own tools.');
  const d = f.model as TexDoc;
  const t = f.tex;
  // The document's own file goes by its name here; the model calls it main.tex.
  const named = Array.isArray(ops) ? ops.map((o) => (o && typeof o === 'object' && (o as { file?: unknown }).file === t.main ? { ...o, file: TEX_MAIN } : o)) : ops;
  const notes: string[] = [];
  const comments = texCommentOps(d.comments ?? [], named, (n) => (n === TEX_MAIN ? d.main : (d.files.find((x) => x.name === n)?.text ?? null)), notes);
  const kept = saveProjectComments(db, { ...d, comments }, t.folder, t.main, d.comments ?? []);
  const open = kept.filter((c) => !c.resolved).length;
  const paths = [t.main, ...d.files.map((x) => x.name)].map((n) => path.resolve(t.folder, n));
  return { text: [`Kept the comments of ${path.join(t.folder, t.main)} and the files it reads: ${open} open, ${kept.length - open} resolved. The user sees them in the editor.`, ...notes].join(' '), paths };
}

/** The comments of the LaTeX project a file belongs to, as the editor's model has them (GET /api/pages/file/comments). */
export async function openFileComments(db: DB, fileIn: string): Promise<{ comments: TexComment[] }> {
  if (editorKindOf(resolvePath(fileIn)) !== 'tex') throw new HttpError(415, 'Comments are kept for LaTeX files (.tex)');
  const f = await openFile(db, fileIn);
  return { comments: (f.model as TexDoc).comments ?? [] };
}
