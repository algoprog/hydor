// The text of a document (PDF, Word, Excel, PowerPoint…) for an agent to read. Imports nothing from
// the server, so Custom's own process (server/agent) can use it too.
//
// Read: PDF (pdftotext, or pdf.js fetched once), Word, Excel and PowerPoint (.docx/.xlsx/.pptx and
// their macro and template kinds), OpenDocument (.odt/.ods/.odp), EPUB, CSV/TSV, RTF; the old binary
// Office files (.doc/.xls/.ppt) through LibreOffice when it is installed. Documents are untrusted:
// zips are inflated with caps, nothing in them runs, and only web and mail links are kept.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DocModel } from '../../shared/documents.ts';
import { Budget, docText } from './model.ts';
import { readDocx, readPptx, readXlsx } from './ooxml.ts';
import { readOdf } from './odf.ts';
import { readEpub } from './epub.ts';
import { readPdf } from './pdf.ts';
import { convert, soffice } from './tools.ts';
import { Zip } from './zip.ts';

export interface DocumentText {
  /** Markdown-ish text: headings, paragraphs, tables as rows. */
  text: string;
  /** What it was read as: "pdf", "docx", "xlsx"… */
  format: string;
  /** Pages (PDF, slides) or sheets, when known. */
  parts?: number;
  /** Something the reader should know: scanned pages without a text layer, sheets cut short… */
  note?: string;
}

/** Most text a document gives (about 250,000 tokens); the reader says when it was cut. */
export const MAX_CHARS = 1_000_000;
/** Largest file read. */
const MAX_FILE = 300 * 1024 * 1024;

const KINDS: Record<string, string> = {
  pdf: 'pdf',
  docx: 'docx', docm: 'docx', dotx: 'docx', dotm: 'docx',
  xlsx: 'xlsx', xlsm: 'xlsx', xltx: 'xlsx', xltm: 'xlsx',
  pptx: 'pptx', pptm: 'pptx', potx: 'pptx', potm: 'pptx', ppsx: 'pptx', ppsm: 'pptx',
  odt: 'odf', ott: 'odf', ods: 'odf', ots: 'odf', odp: 'odf', otp: 'odf', odg: 'odf',
  epub: 'epub',
  csv: 'csv', tsv: 'csv',
  rtf: 'rtf',
  doc: 'legacy', xls: 'legacy', ppt: 'legacy', pps: 'legacy',
};

/** Whether this reads files with that name's extension. */
export const canRead = (file: string) => path.extname(file).slice(1).toLowerCase() in KINDS;

// ---- CSV and RTF ----------------------------------------------------------------------------------

/** CSV rows (quoted fields, commas or semicolons or tabs, line breaks inside quotes). */
export function parseCsv(text: string, sep?: string, maxRows = Infinity): { rows: string[][]; more: boolean } {
  const first = text.slice(0, text.indexOf('\n') >>> 0);
  const d = sep ?? [',', ';', '\t', '|'].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  let i = 0;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') (field += '"'), i++;
        else q = false;
      } else field += ch;
    } else if (ch === '"' && !field) q = true;
    else if (ch === d) row.push(field), (field = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
      if (rows.length >= maxRows) break;
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows, more: i < text.length - 1 };
}

function readCsv(file: string, ext: string, budget: Budget, lim: { rows: number; cols: number }): DocModel {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 20 * 1024 * 1024));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const { rows, more } = parseCsv(text, ext === 'tsv' ? '\t' : undefined, lim.rows);
  const width = Math.min(Math.max(0, ...rows.map((r) => r.length)), lim.cols);
  const notes: string[] = [];
  if (more) notes.push(`Shows the first ${rows.length} rows; the file has more.`);
  if (Math.max(0, ...rows.map((r) => r.length)) > lim.cols) notes.push(`Shows the first ${lim.cols} columns.`);
  budget.take(rows.reduce((n, r) => n + r.join('').length + r.length * 3, 0));
  return {
    format: ext,
    parts: [{ kind: 'sheet', title: path.basename(file), blocks: [], cells: { col: 0, rows: rows.map((r, i) => ({ n: i + 1, c: Array.from({ length: width }, (_, k) => r[k] ?? '') })), totalRows: rows.length, totalCols: width, ...(more ? { more } : {}) } }],
    notes,
  };
}

/** RTF's text: control words and hidden groups dropped, escapes decoded (Windows-1252 for \'hh). */
export function rtfText(rtf: string): string {
  const cp1252 = new TextDecoder('windows-1252');
  let out = '';
  let depth = 0;
  let skipAt = -1;
  let uc = 1;
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    if (ch === '{') {
      depth++;
      if (skipAt < 0 && rtf.startsWith('{\\*', i)) skipAt = depth;
      continue;
    }
    if (ch === '}') {
      if (depth === skipAt) skipAt = -1;
      depth--;
      continue;
    }
    if (ch === '\\') {
      const m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\([^a-z])/i.exec(rtf.slice(i, i + 40));
      if (!m) continue;
      i += m[0].length - 1;
      if (skipAt >= 0) continue;
      if (m[3]) out += cp1252.decode(new Uint8Array([parseInt(m[3], 16)]));
      else if (m[4]) out += m[4] === '~' ? ' ' : m[4] === '_' ? '-' : '{}\\'.includes(m[4]) ? m[4] : '';
      else {
        const w = m[1];
        if (w === 'par' || w === 'line' || w === 'row') out += '\n';
        else if (w === 'tab' || w === 'cell') out += '\t';
        else if (w === 'uc') uc = Number(m[2] ?? 1);
        else if (w === 'u') {
          const n = Number(m[2]);
          out += String.fromCharCode(n < 0 ? n + 65536 : n);
          // The stand-in characters that follow for older readers.
          for (let k = 0; k < uc && rtf[i + 1] && rtf[i + 1] !== '\\' && rtf[i + 1] !== '{' && rtf[i + 1] !== '}'; k++) i++;
        } else if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'object', 'datastore', 'themedata', 'listtable', 'listoverridetable', 'rsidtbl', 'generator'].includes(w)) skipAt = depth;
      }
      continue;
    }
    if (skipAt >= 0 || ch === '\r' || ch === '\n') continue;
    out += ch;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---- reading --------------------------------------------------------------------------------------

/** What a file really is, from its first bytes. */
function sniff(file: string): 'zip' | 'pdf' | 'ole' | 'rtf' | null {
  const b = Buffer.alloc(8);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, b, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip';
  if (b.toString('latin1', 0, 5) === '%PDF-') return 'pdf';
  if (b.readUInt32BE(0) === 0xd0cf11e0) return 'ole';
  if (b.toString('latin1', 0, 5) === '{\\rtf') return 'rtf';
  return null;
}

/** A zip-based document's kind from its content, when its name does not say. */
function zipKind(zip: Zip): string | null {
  const mime = zip.text('mimetype', 200)?.trim() ?? '';
  if (mime === 'application/epub+zip') return 'epub';
  if (mime.startsWith('application/vnd.oasis.opendocument')) return 'odf';
  if (zip.has('word/document.xml')) return 'docx';
  if (zip.has('xl/workbook.xml')) return 'xlsx';
  if (zip.has('ppt/presentation.xml')) return 'pptx';
  return null;
}

const cache = new Map<string, DocModel>();

export interface ReadOptions {
  maxChars?: number;
  /** Rows and columns per sheet. */
  rows?: number;
  cols?: number;
}

/** A document's content as blocks, sheets and slides; null when it is not a kind this reads. */
export async function readDocument(file: string, o: ReadOptions = {}): Promise<DocModel | null> {
  const st = fs.statSync(file);
  if (!st.isFile()) throw new Error(`${file} is not a file`);
  const ext = path.extname(file).slice(1).toLowerCase();
  let kind = KINDS[ext];
  if (!kind) return null;
  if (st.size > MAX_FILE) throw new Error(`The file is ${Math.round(st.size / 1048576)} MB: too big to read here.`);
  const key = `${file}\0${st.size}\0${st.mtimeMs}\0${JSON.stringify(o)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const budget = new Budget(o.maxChars ?? MAX_CHARS);
  const lim = { rows: o.rows ?? 2000, cols: o.cols ?? 60 };
  const real = st.size ? sniff(file) : null;
  // The name may not say what the file is: an old .doc renamed .docx, a .zip that is a document…
  if (real === 'ole' && kind !== 'legacy') {
    // A Word, Excel or PowerPoint file locked with a password is packed this way too.
    if (!soffice()) return { format: ext, parts: [], notes: [`This file is locked with a password, or it is an old binary Office file named .${ext}: it cannot be read here without LibreOffice.`] };
    kind = 'legacy';
  }
  else if (real === 'pdf') kind = 'pdf';
  else if (real === 'rtf') kind = 'rtf';
  let doc: DocModel;
  if (kind === 'pdf') doc = await readPdf(file, budget);
  else if (kind === 'csv') doc = readCsv(file, ext, budget, lim);
  else if (kind === 'rtf') {
    const text = rtfText(fs.readFileSync(file, 'latin1')).slice(0, budget.max);
    doc = { format: 'rtf', parts: [{ kind: 'body', blocks: text.split(/\n+/).filter((t) => t.trim()).map((t) => ({ k: 'p' as const, s: [{ t: t.trim() }] })) }], notes: [] };
  } else if (kind === 'legacy') doc = await readLegacy(file, ext, o);
  else {
    if (real !== 'zip') throw new Error(`This is not a ${ext.toUpperCase()} file inside (it may be damaged, or another kind of file renamed).`);
    let zip: Zip;
    try {
      zip = new Zip(fs.readFileSync(file));
    } catch {
      throw new Error(`This ${ext.toUpperCase()} file is damaged or cut short, so it cannot be opened.`);
    }
    const k = zipKind(zip) ?? kind;
    if (zip.has('EncryptedPackage')) throw new Error('This document is locked with a password.');
    doc = k === 'docx' ? readDocx(zip, budget) : k === 'xlsx' ? readXlsx(zip, budget, lim) : k === 'pptx' ? readPptx(zip, budget) : k === 'epub' ? readEpub(zip, budget) : readOdf(zip, budget, lim);
    if (zip.cut.size && !doc.notes.length) doc.notes.push('Parts of it are very large: only their beginning was read.');
    if (k === 'docx' || k === 'xlsx' || k === 'pptx') doc.format = ext in KINDS && KINDS[ext] === k ? ext : k;
    else if (k === 'odf') doc.format = ['odt', 'ods', 'odp', 'odg', 'ott', 'ots', 'otp'].includes(ext) ? ext : doc.format;
  }
  if (budget.cut && !doc.notes.some((n) => /more text than|first part|beginning/.test(n))) doc.notes.push(`It was cut at about ${budget.max.toLocaleString('en-US')} characters.`);
  cache.set(key, doc);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return doc;
}

/** An old binary Office file (.doc, .xls, .ppt): LibreOffice turns it into the current kind first. */
async function readLegacy(file: string, ext: string, o: ReadOptions): Promise<DocModel> {
  const to = ext === 'xls' ? 'xlsx' : ext === 'ppt' || ext === 'pps' ? 'pptx' : 'docx';
  const what = to === 'xlsx' ? 'Excel' : to === 'pptx' ? 'PowerPoint' : 'Word';
  if (!soffice())
    return {
      format: ext,
      parts: [],
      notes: [`This is an old binary ${what} file (.${ext}). Reading it needs LibreOffice, which is not installed here: ask for it saved as .${to}, or install LibreOffice.`],
    };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-doc-'));
  try {
    const out = await convert(file, to, path.join(dir, `document.${to}`));
    const doc = await readDocument(out, o);
    if (!doc) throw new Error('LibreOffice could not convert it');
    return { ...doc, format: ext, notes: [...doc.notes, `Converted from .${ext} with LibreOffice.`] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The text of a document, or null when its format is not one this can read. */
export async function extractText(file: string): Promise<DocumentText | null> {
  const doc = await readDocument(file);
  if (!doc) return null;
  let text = docText(doc);
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS)}\n\n… (cut here)`;
  const note = doc.notes.join(' ') || undefined;
  if (!text.trim()) text = note ?? '(The document has no text.)';
  // Pages, sheets or slides: a Word file's parts (its body, footnotes, comments) are not pages.
  const counted = doc.parts.filter((x) => x.kind === 'page' || x.kind === 'sheet' || x.kind === 'slide').length;
  return { text, format: doc.format, parts: counted || undefined, note };
}
