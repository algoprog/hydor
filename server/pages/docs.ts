// Documents in Pages: a page of the kind "doc" keeps its document (shared/docs.ts) as text, a line per block, its
// pictures apart (assets.ts). Wherever a page's HTML is needed (the frame in the conversation, its own address, a
// published copy, its picture in Pages, a PDF), the document's own page is made from it: its sheets of paper with
// the pictures inside (viewer), its pages as they print (print), or the top of its first page (still). It exports
// as Word (docx.ts writes the file) and Markdown, and is made from Word, Markdown, text and HTML files.
//
// save_doc is how agents make and change documents; get_page gives one back as Markdown, which says all a
// document holds but its blocks' ids (carried over from the version it changes when it comes back).
import {
  ASSET,
  blockHtml,
  carryIds,
  docCss,
  docFonts,
  docLink,
  docMarkdown,
  docOutline,
  docSources,
  docText,
  docWords,
  DOC_LIMITS,
  headingLevel,
  htmlBlocks,
  HL,
  listInfo,
  mapDocSources,
  mergeRuns,
  normalizeBlocks,
  normalizeDoc,
  PAPERS,
  STYLES,
  type Align,
  type Doc,
  type Look,
  type ParaStyle,
  type Run,
} from '../../shared/docs.ts';
import { FONTS, googleFamilies } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { rels } from '../documents/ooxml.ts';
import { all, att, isEl, kid, kids, parseXml, patt, path as xpath, type El } from '../documents/xml.ts';
import { Zip } from '../documents/zip.ts';
import { assetDataUrl, getAsset, pictureType, putAsset, takeIn } from './assets.ts';
import { docxFile, type DocBlock as WordBlock, type DocLook, type DocRun as WordRun } from './docx.ts';
import { imageSize } from './ooxml.ts';
import type { Picture } from './pptx.ts';

/** The longest a document's text may be (its pictures are kept apart). */
export const MAX_DOC = 3 * 1024 * 1024;

/** A document's text, read back; a broken one is an error a person can act on. */
export function readDoc(text: string): Doc {
  try {
    return normalizeDoc(JSON.parse(text));
  } catch (e) {
    throw new HttpError(500, `This document could not be read: ${(e as Error).message}`);
  }
}

/** A document with no blocks left (its only picture could not be kept) has an empty paragraph to write in. */
const notEmpty = (d: Doc): Doc => (d.blocks.length ? d : { ...d, blocks: normalizeBlocks([{ type: 'p', runs: [] }]) });

/** The document as it is kept, checked; data: pictures are kept apart, other sources stay as they are. */
export function keepDoc(db: DB, input: unknown): { doc: Doc; text: string } {
  let doc: Doc;
  try {
    doc = normalizeDoc(input);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  doc = notEmpty(
    mapDocSources(doc, (s) => {
      if (!s.startsWith('data:')) return s;
      const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(s);
      return m ? ASSET + putAsset(db, Buffer.from(m[1], 'base64')) : '';
    }),
  );
  const text = docText(doc);
  if (Buffer.byteLength(text) > MAX_DOC) throw new HttpError(413, `The document is over ${MAX_DOC / 1024 / 1024} MB without its pictures; make it smaller.`);
  return { doc, text };
}

/**
 * A document from an agent (what save_doc gets, but its id and title): checked as keepDoc does, its pictures taken
 * in first (files of its session, data: addresses, pictures on the web). `prev`, the kept text of the version it
 * changes, gives what it leaves out (its paper, font and size) and its blocks' ids where they are the same blocks.
 * What could not be taken in is said in `notes`, for the agent.
 */
export async function agentDoc(db: DB, input: unknown, cwd: string, prev?: string): Promise<{ doc: Doc; text: string; notes: string[] }> {
  const v = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  if (typeof v.markdown !== 'string' && !Array.isArray(v.blocks)) throw new Error('Give the whole document as markdown (a string) or as blocks (an array). See save_doc’s description.');
  let base: Doc | null = null;
  if (prev) {
    try {
      base = readDoc(prev);
    } catch {}
  }
  const page = { ...(base?.page ?? {}), ...(typeof v.page === 'string' ? { size: v.page } : v.page && typeof v.page === 'object' ? (v.page as object) : {}) };
  let doc: Doc;
  try {
    // Any source may be a file of the session's: kept as written until it is taken in below.
    doc = normalizeDoc({ markdown: v.markdown, blocks: v.blocks, page, font: v.font ?? base?.font, size: v.size ?? base?.size }, { src: (s) => (s.length <= 4096 ? s : null) });
  } catch (e) {
    throw new Error(`${(e as Error).message} See save_doc’s description for the document’s shape.`);
  }
  const notes: string[] = [];
  const done = new Map<string, string>();
  for (const s of new Set(docSources(doc))) done.set(s, await takeIn(db, s, { cwd, notes }));
  doc = notEmpty(mapDocSources(doc, (s) => done.get(s) ?? s));
  if (base) doc = carryIds(base, doc);
  const text = docText(doc);
  if (Buffer.byteLength(text) > MAX_DOC) throw new Error(`The document is over ${MAX_DOC / 1024 / 1024} MB without its pictures; make it smaller.`);
  return { doc, text, notes };
}

// ---- its own page -------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const PX_MM = 96 / 25.4;

/** How the sheets of paper sit on the page around them, for each way the page shows. */
function pageCss(doc: Doc, mode: 'viewer' | 'print' | 'still'): string {
  const paper = PAPERS[doc.page.size];
  const m = doc.page.margin;
  const w = Math.round(paper.w * PX_MM);
  const base = [
    'html,body{margin:0;padding:0}',
    'body{background:var(--n-bg,#eceae6);-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'html[data-n-theme=dark] body{background:#000000}',
    '.nd-doc{padding:24px 16px 32px;box-sizing:border-box}',
    `.nd-sheet{box-sizing:border-box;background:#fff;width:${paper.w}mm;max-width:none;margin:0 auto 20px;padding:${m}mm;` +
      'box-shadow:0 1px 3px rgba(0,0,0,.12),0 10px 30px rgba(0,0,0,.07);border-radius:2px}',
    '.nd-sheet:last-child{margin-bottom:0}',
  ];
  if (mode === 'print')
    return [
      ...base,
      `@page{size:${doc.page.size === 'letter' ? 'letter' : 'A4'};margin:${m}mm}`,
      'html,body{background:#fff!important}',
      '.nd-doc{padding:0}',
      '.nd-sheet{width:auto;padding:0;margin:0;box-shadow:none;border-radius:0}',
      '.nd-sheet+.nd-sheet{break-before:page}',
      '.nd-doc tr,.nd-doc figure,.nd-doc .nd-hr,.nd-doc pre.nd-b{break-inside:avoid}',
      '.nd-doc thead{display:table-header-group}',
      '.nd-doc h1,.nd-doc h2,.nd-doc h3,.nd-doc h4,.nd-doc .nd-title,.nd-doc .nd-subtitle{break-after:avoid}',
      '.nd-doc .nd-b{orphans:2;widows:2}',
    ].join('\n');
  if (mode === 'still') {
    // The top of the first page, large enough to read in the list's picture.
    const zoom = Math.round((1040 / w) * 100) / 100;
    return [...base, 'html,body{overflow:hidden;background:#e8e6e1!important}', '.nd-doc{padding:56px 0 0}', `.nd-sheet{zoom:${zoom};min-height:${paper.h}mm;box-shadow:0 1px 4px rgba(0,0,0,.14)}`].join('\n');
  }
  // In a narrower frame the sheet is drawn smaller; on a phone its words fill the width instead.
  const fit = [0.92, 0.85, 0.78, 0.72]
    .map((k, i, all) => `@media (max-width:${Math.round(w * (i ? all[i - 1] : 1) + 32)}px){.nd-sheet{zoom:${k}}}`)
    .join('\n');
  return [
    ...base,
    fit,
    // There, a table's columns take what their words need, not the widths set for the paper.
    `@media (max-width:${Math.round(w * 0.72 + 31)}px){.nd-doc{padding:0;--nd-step:22pt}.nd-sheet{zoom:1;width:auto;padding:22px 18px 28px;margin:0 0 8px;box-shadow:none;border-radius:0}.nd-doc table.nd-table{table-layout:auto}.nd-doc .nd-table col{width:auto!important}}`,
  ].join('\n');
}

/**
 * The document's own page: its sheets of paper to read (`viewer`, in a frame or on its own; a page break starts
 * another sheet), its pages to print as Chromium makes them a PDF (`print`: its paper and margins, page breaks
 * where it has them, tables' rows, pictures and code kept whole), or the top of its first page (`still`, its
 * picture in Pages, at 1280×800). Its pictures go inside it; nothing in it is markup or a script but what this writes.
 */
export function docPage(db: DB, doc: Doc, title: string, mode: 'viewer' | 'print' | 'still' = 'viewer'): string {
  const inside = mapDocSources(doc, (s) => (s.startsWith(ASSET) ? (assetDataUrl(db, s.slice(ASSET.length)) ?? '') : s));
  const { labels } = listInfo(inside.blocks);
  const sheets: string[][] = [[]];
  for (let i = 0; i < inside.blocks.length; i++) {
    const b = inside.blocks[i];
    if (b.type === 'pagebreak') {
      if (mode === 'still') break;
      sheets.push([]);
      continue;
    }
    if (mode === 'still' && sheets[0].length >= 60) break;
    sheets[sheets.length - 1].push(blockHtml(b, labels[i], { src: (s) => s }));
  }
  const fams = googleFamilies(docFonts(inside));
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>`,
    '<meta name="generator" content="Hydor documents">',
    fams ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${esc(fams)}&amp;display=swap">` : '',
    `<style>${pageCss(doc, mode)}\n${docCss(doc)}</style></head><body>`,
    `<main class="nd-doc" translate="no">${sheets.map((s) => `<div class="nd-sheet">${s.join('')}</div>`).join('')}</main>`,
    '</body></html>',
  ].join('\n');
}

/** What get_page tells an agent of a document: its outline, then the document as Markdown, and how to change it. */
export function docForAgent(text: string): string {
  const doc = readDoc(text);
  const md = docMarkdown(doc);
  const body =
    md.length > 200_000
      ? `${md.slice(0, 200_000)}\n… (cut here: the document is ${Math.round(md.length / 1024)} KB as Markdown. Sending it back whole would lose what you did not read: tell the user, and change it only if they want the rest rewritten.)`
      : md;
  const paper = PAPERS[doc.page.size].label;
  return [
    `A document of about ${docWords(doc)} words, ${doc.blocks.length} block${doc.blocks.length === 1 ? '' : 's'} (${paper} paper, ${doc.page.margin} mm margins; ${doc.font} ${doc.size} pt).`,
    '',
    'Outline:',
    docOutline(doc),
    '',
    'The document as Markdown. To change it, send it back whole with save_doc and this id (markdown; page, font and size only to change them). Keep what you do not mean to change as it is: the attributes in braces ({.title}, {.center}…), <u>, <span style>, ==highlights==, and the pictures’ naget-asset: sources.',
    '',
    body,
  ].join('\n');
}

// ---- Word ---------------------------------------------------------------------------------------------------------

const JC: Record<string, 'center' | 'right' | 'justify' | undefined> = { center: 'center', right: 'right', justify: 'justify' };
const PX_PER_TEXT = (doc: Doc) => (PAPERS[doc.page.size].w - 2 * doc.page.margin) * PX_MM;

const wordRun = (r: Run): WordRun => {
  const w: WordRun = { t: r.t };
  for (const k of ['b', 'i', 'u', 's', 'code', 'sup', 'sub'] as const) if (r[k]) w[k] = true;
  if (r.color) w.color = r.color;
  if (r.hl) w.hl = r.hl;
  if (r.size) w.size = r.size;
  if (r.font) w.font = r.font;
  if (r.link) w.link = r.link;
  return w;
};

/** A picture of the kept ones as Word takes it (PNG, JPEG, GIF); null for another kind (SVG, WebP) or none. */
function keptPicture(db: DB, src: string): Picture | null {
  let data: Buffer | null = null;
  if (src.startsWith(ASSET)) data = getAsset(db, src.slice(ASSET.length))?.data ?? null;
  else if (src.startsWith('data:')) {
    const m = /^data:[a-z/+.-]+;base64,(.+)$/i.exec(src);
    data = m ? Buffer.from(m[1], 'base64') : null;
  }
  const size = data ? imageSize(data) : null;
  return data && size && size.type !== 'webp' ? { data, ext: size.type, w: size.w, h: size.h } : null;
}

/**
 * The document as a Word file: its paper and margins, font and sizes, headings, lists (checklists with boxes Word
 * ticks), tables, pictures (from the kept ones, or `picture`: made ready for Office, an SVG drawn as PNG) and page
 * breaks.
 */
export function docxOfDoc(db: DB, doc: Doc, title: string, picture?: (src: string) => Picture | null): Buffer {
  const { groups } = listInfo(doc.blocks);
  const blocks: WordBlock[] = [];
  const pictures: Buffer[] = [];
  const textPx = PX_PER_TEXT(doc);
  doc.blocks.forEach((b, i) => {
    if (b.type === 'p') {
      const runs = b.runs.map(wordRun);
      const align = b.align ? JC[b.align] : undefined;
      const style = b.style ?? 'normal';
      const lvl = headingLevel(style);
      if (lvl) blocks.push({ k: 'h', lvl: lvl as 1 | 2 | 3 | 4, runs, keep: true, ...(align ? { align } : {}) });
      else if (style === 'code') blocks.push({ k: 'pre', text: b.runs.map((r) => r.t).join('') || ' ' });
      else
        blocks.push({
          k: 'p',
          runs,
          keep: true,
          ...(align ? { align } : {}),
          ...(style === 'quote' ? { quote: true } : {}),
          ...(style === 'title' || style === 'subtitle' ? { style } : {}),
          ...(b.lvl ? { indent: b.lvl } : {}),
        });
    } else if (b.type === 'li') {
      const align = b.align ? JC[b.align] : undefined;
      blocks.push({
        k: 'li',
        ordered: b.list === 'number',
        lvl: b.lvl ?? 0,
        list: groups[i],
        runs: b.runs.map(wordRun),
        keep: true,
        ...(b.list === 'check' ? { check: true, ...(b.checked ? { checked: true } : {}) } : {}),
        ...(align ? { align } : {}),
      });
    } else if (b.type === 'table') {
      blocks.push({
        k: 'table',
        rows: b.rows.map((r, ri) => ({ cells: r.map((c) => ({ runs: c.runs.map(wordRun), ...(b.head && ri === 0 ? { head: true } : {}), ...(c.align && JC[c.align] ? { align: JC[c.align] } : {}) })) })),
        ...(b.cols ? { cols: b.cols } : {}),
      });
    } else if (b.type === 'image') {
      const pic = picture?.(b.src) ?? keptPicture(db, b.src);
      if (!pic || pic.ext === 'webp') {
        if (b.alt || b.caption) blocks.push({ k: 'p', runs: [{ t: b.caption || b.alt || '', i: true }] });
        return;
      }
      const w = Math.max(16, Math.round(textPx * b.w));
      pictures.push(pic.data);
      blocks.push({ k: 'img', shot: pictures.length - 1, w, h: Math.round((w * pic.h) / Math.max(1, pic.w)), align: b.align ?? 'center', ...(b.alt ? { alt: b.alt } : {}), ...(b.caption ? { caption: b.caption } : {}) });
    } else if (b.type === 'hr') blocks.push({ k: 'hr' });
    else blocks.push({ k: 'pb' });
  });
  const look: DocLook = {
    font: doc.font,
    size: doc.size,
    title: Math.round(doc.size * STYLES.title.k * 2) / 2,
    subtitle: Math.round(doc.size * STYLES.subtitle.k * 2) / 2,
    heads: (['h1', 'h2', 'h3', 'h4', 'h4', 'h4'] as ParaStyle[]).map((s) => Math.round(doc.size * STYLES[s].k * 2) / 2),
    // Word's line spacing counts from the font's own line (about 1.15 of its size), CSS's from its size.
    line: Math.round((STYLES.normal.lh / 1.15) * 100) / 100,
    after: Math.round(doc.size * STYLES.normal.after * 2) / 2,
  };
  return docxFile(
    { title, lang: '', blocks, shots: pictures.map(() => ({ x: 0, y: 0, w: 1, h: 1 })) },
    pictures,
    { title, paper: doc.page.size, margin: doc.page.margin, look, titled: false },
  );
}

// ---- made from a file ---------------------------------------------------------------------------------------------

/** Text from a file's bytes: UTF-8, or UTF-16 by its byte order mark. */
function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2);
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const b = Buffer.from(buf.subarray(2));
    b.swap16();
    return b.toString('utf16le');
  }
  return buf.toString('utf8').replace(/^﻿/, '');
}

/** Plain text as paragraphs: a blank line between them; lines wrapped short (as e-mails are) joined again. */
function textDoc(text: string): Doc {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
  const blocks = paras.map((p) => {
    const lines = p.split('\n').map((l) => l.replace(/\s+$/, ''));
    const wrapped = lines.length > 1 && lines.slice(0, -1).every((l) => l.length >= 40 && l.length <= 100);
    return { type: 'p', runs: [{ t: wrapped ? lines.map((l) => l.trim()).join(' ') : lines.join('\n') }] };
  });
  return normalizeDoc({ blocks: blocks.filter((b) => b.runs[0].t.trim()) });
}

/**
 * A document from a file someone opens: a Word file (.docx: headings, paragraphs with their bold, italic,
 * underline, colours, highlights, sizes and links, lists, checklists, tables, pictures, page breaks, its paper and
 * margins), Markdown, plain text, or a web page (.html, its words and pictures; nothing of it runs). Pictures come
 * inside it as data: addresses (keepDoc keeps them apart). Throws, in words a person can act on, for any other file.
 */
export function docFromFile(buf: Buffer, name: string): Doc {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '').replace(/^(docm|dotx|dotm)$/, 'docx');
  if (ext === 'docx') return wordDoc(buf);
  if (ext === 'doc' || ext === 'odt' || ext === 'rtf' || ext === 'pages') throw new Error(`A .${ext} file opens here once it is saved as a Word document (.docx)`);
  const text = decodeText(buf);
  if (ext === 'md' || ext === 'markdown' || ext === 'mdown' || ext === 'mkd') return normalizeDoc({ markdown: text });
  if (ext === 'txt' || ext === 'text' || ext === 'log' || ext === '') return textDoc(text);
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return normalizeDoc({ blocks: htmlBlocks(text, { looks: true }) });
  throw new Error('A document is made from a Word file (.docx), Markdown (.md), text (.txt) or a web page (.html)');
}

// A Word file read for what a document keeps. Word keeps a paragraph's look in its style (and the styles it is
// based on) and the run's own properties; a document of Pages has its own styles, so only what a run says itself
// (or its character style says) is kept: a heading's bold and size come from the heading.

interface WStyle {
  name: string;
  basedOn?: string;
  outline?: number;
  numId?: string;
  ilvl?: number;
  rPr?: El;
}

const on = (el: El | undefined): boolean | undefined => (el ? !['0', 'false', 'off'].includes(att(el, 'val') ?? '') : undefined);

const HIGHLIGHT: Record<string, string> = {
  yellow: HL,
  green: '#bbf7d0',
  cyan: '#a5f3fc',
  magenta: '#fbcfe8',
  blue: '#bfdbfe',
  red: '#fecaca',
  darkBlue: '#1e3a8a',
  darkCyan: '#0e7490',
  darkGreen: '#166534',
  darkMagenta: '#86198f',
  darkRed: '#991b1b',
  darkYellow: '#a16207',
  darkGray: '#6b7280',
  lightGray: '#e5e7eb',
  black: '#000000',
};

const MONO_FONTS = /consolas|courier|menlo|monaco|mono|source code|fira code|inconsolata|lucida console/i;

interface WCtx {
  zip: Zip;
  rels: ReturnType<typeof rels>;
  styles: Map<string, WStyle>;
  nums: Map<string, Map<number, { fmt: string; text: string }>>;
  theme: { major?: string; minor?: string };
  font: string;
  size: number;
  textEmu: number;
  pics: number;
}

/** A style and those it is based on. */
function chain(ctx: WCtx, id: string | undefined): WStyle[] {
  const out: WStyle[] = [];
  for (let k = 0; id && k < 10; k++) {
    const s = ctx.styles.get(id);
    if (!s) break;
    out.push(s);
    id = s.basedOn;
  }
  return out;
}

/** A font's name from rFonts (the theme's for its references). */
function fontOf(ctx: WCtx, rFonts: El | undefined): string | undefined {
  if (!rFonts) return undefined;
  const theme = att(rFonts, 'asciiTheme') ?? att(rFonts, 'hAnsiTheme');
  if (theme) return /major/i.test(theme) ? ctx.theme.major : ctx.theme.minor;
  return att(rFonts, 'ascii') ?? att(rFonts, 'hAnsi') ?? att(rFonts, 'cs');
}

/** A run's look from its properties (the run's own, or a character style's). */
function rLook(ctx: WCtx, rPr: El | undefined, into: Look) {
  if (!rPr) return;
  const b = on(kid(rPr, 'b'));
  if (b !== undefined) b ? (into.b = true) : delete into.b;
  const i = on(kid(rPr, 'i'));
  if (i !== undefined) i ? (into.i = true) : delete into.i;
  const u = kid(rPr, 'u');
  if (u) att(u, 'val') === 'none' ? delete into.u : (into.u = true);
  const s = on(kid(rPr, 'strike')) ?? on(kid(rPr, 'dstrike'));
  if (s !== undefined) s ? (into.s = true) : delete into.s;
  const va = att(kid(rPr, 'vertAlign'), 'val');
  if (va === 'superscript') into.sup = true;
  else if (va === 'subscript') into.sub = true;
  const color = att(kid(rPr, 'color'), 'val');
  if (color && /^[0-9a-f]{6}$/i.test(color) && !/^(000000|auto)$/i.test(color)) into.color = `#${color.toLowerCase()}`;
  const hl = att(kid(rPr, 'highlight'), 'val');
  if (hl && HIGHLIGHT[hl]) into.hl = HIGHLIGHT[hl];
  const shd = att(kid(rPr, 'shd'), 'fill');
  if (shd && /^[0-9a-f]{6}$/i.test(shd) && !/^ffffff$/i.test(shd)) into.hl = `#${shd.toLowerCase()}`;
  const sz = Number(att(kid(rPr, 'sz'), 'val'));
  if (sz > 0) into.size = Math.round(sz) / 2;
  const font = fontOf(ctx, kid(rPr, 'rFonts'));
  if (font) {
    if (MONO_FONTS.test(font)) into.code = true;
    else into.font = font;
  }
}

/** What a paragraph is: its style (a heading, the title…), list, alignment and indent. */
function pKind(ctx: WCtx, pPr: El | undefined): { style: ParaStyle; list?: { kind: 'bullet' | 'number' | 'check'; lvl: number }; align?: Align; lvl: number; left: number; caption: boolean } {
  const id = att(kid(pPr, 'pStyle'), 'val');
  const styles = chain(ctx, id);
  let style: ParaStyle = 'normal';
  const caption = styles.some((s) => /^caption$/i.test(s.name));
  const outline = att(kid(pPr, 'outlineLvl'), 'val');
  for (const s of styles) {
    const n = s.name.toLowerCase();
    if (n === 'title') style = 'title';
    else if (n === 'subtitle') style = 'subtitle';
    else if (/^heading\s*\d/.test(n)) style = `h${Math.min(4, Number(/\d/.exec(n)![0]))}` as ParaStyle;
    else if (/quote/.test(n)) style = 'quote';
    else if (/code|preformatted|source/.test(n)) style = 'code';
    else if (s.outline !== undefined && s.outline < 9) style = `h${Math.min(4, s.outline + 1)}` as ParaStyle;
    else continue;
    break;
  }
  if (outline !== undefined && Number(outline) < 9) style = `h${Math.min(4, Number(outline) + 1)}` as ParaStyle;
  // Its list: its own numbering, or its style's.
  const numPr = kid(pPr, 'numPr');
  let numId = att(kid(numPr, 'numId'), 'val');
  let ilvl = att(kid(numPr, 'ilvl'), 'val') !== undefined ? Number(att(kid(numPr, 'ilvl'), 'val')) : undefined;
  if (numId === undefined)
    for (const s of styles)
      if (s.numId !== undefined) {
        numId = s.numId;
        ilvl ??= s.ilvl;
        break;
      }
  let list: { kind: 'bullet' | 'number' | 'check'; lvl: number } | undefined;
  if (numId && numId !== '0' && !headingLevel(style) && style !== 'title') {
    const lv = ctx.nums.get(numId)?.get(ilvl ?? 0);
    if (lv && lv.fmt !== 'none')
      list = { kind: lv.fmt === 'bullet' ? (/[☐☑☒□]/.test(lv.text) ? 'check' : 'bullet') : 'number', lvl: Math.min(4, ilvl ?? 0) };
  }
  const jc = att(kid(pPr, 'jc'), 'val');
  const align: Align | undefined = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'distribute' ? 'justify' : undefined;
  const left = Number(att(kid(pPr, 'ind'), 'left') ?? att(kid(pPr, 'ind'), 'start') ?? 0);
  return { style, list, align, lvl: list ? 0 : Math.min(4, Math.max(0, Math.round(left / 720))), left, caption };
}

/** A picture of a drawing, from the file's media, as a picture block (its width as a share of the text's). */
function drawingImage(ctx: WCtx, x: El, align: Align | undefined): Record<string, unknown> | null {
  const blip = all(x, 'blip')[0] ?? all(x, 'imagedata')[0];
  const id = patt(blip, 'embed') ?? patt(blip, 'id') ?? att(blip, 'embed');
  const target = id ? ctx.rels.get(id)?.target : undefined;
  if (!target || ctx.pics >= 300) return null;
  const data = ctx.zip.read(target, 13 * 1024 * 1024);
  const mime = data ? pictureType(data) : null;
  if (!data || !mime || data.length > 12 * 1024 * 1024) return null;
  ctx.pics++;
  const ext = all(x, 'extent')[0];
  const cx = Number(att(ext, 'cx')) || 0;
  const pr = all(x, 'docPr')[0] ?? all(x, 'cNvPr')[0];
  const alt = (att(pr, 'descr') || att(pr, 'title') || '').trim();
  return {
    type: 'image',
    src: `data:${mime};base64,${data.toString('base64')}`,
    w: cx && ctx.textEmu ? Math.min(1, cx / ctx.textEmu) : 1,
    ...(alt ? { alt } : {}),
    ...(align === 'left' || align === 'right' ? { align } : {}),
  };
}

interface PCollect {
  runs: Run[];
  /** Blocks that come after the paragraph's words: its pictures, and what its text boxes hold. */
  after: Record<string, unknown>[];
  /** The paragraph breaks into the next page here: what follows goes on in a paragraph of its own. */
  breaks: number[];
  checked?: boolean;
  check?: boolean;
  link?: string;
  /** A field being read: its instruction so far, and whether its result is being read. */
  field?: { instr: string; result: boolean; link?: string };
}

function runContent(ctx: WCtx, r: El, look: Look, c: PCollect, align: Align | undefined) {
  const add = (t: string) => {
    if (!t) return;
    const link = c.field?.result ? (c.field.link ?? c.link) : c.link;
    c.runs.push({ t, ...look, ...(link ? { link } : {}) });
  };
  for (const x of r.c) {
    if (!isEl(x)) continue;
    switch (x.n) {
      case 't':
        if (!c.field || c.field.result) add(x.c.map((y) => (typeof y === 'string' ? y : '')).join(''));
        break;
      case 'tab':
      case 'ptab':
        add('\t');
        break;
      case 'br':
      case 'cr':
        if (att(x, 'type') === 'page') c.breaks.push(c.runs.length);
        else if (att(x, 'type') !== 'column') add('\n');
        break;
      case 'noBreakHyphen':
        add('-');
        break;
      case 'instrText':
        if (c.field && !c.field.result) c.field.instr += x.c.map((y) => (typeof y === 'string' ? y : '')).join('');
        break;
      case 'fldChar': {
        const t = att(x, 'fldCharType');
        if (t === 'begin') c.field = { instr: '', result: false };
        else if (t === 'separate' && c.field) {
          c.field.result = true;
          const m = /HYPERLINK\s+"([^"]+)"/.exec(c.field.instr);
          c.field.link = m ? docLink(m[1]) : undefined;
        } else if (t === 'end') c.field = undefined;
        break;
      }
      case 'drawing':
      case 'pict':
      case 'object': {
        // Text boxes: their paragraphs after this one; a picture: a picture block; a line across (VML): a rule.
        const boxes = all(x, 'txbxContent');
        if (boxes.length) {
          for (const bx of boxes) wordBody(ctx, bx, c.after, 1);
          break;
        }
        if (all(x, 'rect').some((v) => att(v, 'hr') === 't')) {
          c.after.push({ type: 'hr' });
          break;
        }
        const img = drawingImage(ctx, x, align);
        if (img) c.after.push(img);
        break;
      }
      case 'AlternateContent': {
        const ch = kid(x, 'Choice') ?? kid(x, 'Fallback');
        if (ch) runContent(ctx, ch, look, c, align);
        break;
      }
    }
  }
}

function inline(ctx: WCtx, el: El, c: PCollect, align: Align | undefined) {
  for (const x of el.c) {
    if (!isEl(x)) continue;
    switch (x.n) {
      case 'r': {
        const rPr = kid(x, 'rPr');
        const look: Look = {};
        // Its character style's look, then its own.
        for (const s of chain(ctx, att(kid(rPr, 'rStyle'), 'val')).reverse()) {
          if (/code/i.test(s.name)) look.code = true;
          rLook(ctx, s.rPr, look);
        }
        rLook(ctx, rPr, look);
        if (look.size === ctx.size) delete look.size;
        if (look.font && look.font.toLowerCase() === ctx.font.toLowerCase()) delete look.font;
        runContent(ctx, x, look, c, align);
        break;
      }
      case 'hyperlink': {
        const rel = ctx.rels.get(patt(x, 'id') ?? '');
        const was = c.link;
        c.link = (rel?.external ? docLink(rel.target) : undefined) ?? was;
        inline(ctx, x, c, align);
        c.link = was;
        break;
      }
      case 'fldSimple': {
        const was = c.link;
        const m = /HYPERLINK\s+"([^"]+)"/.exec(att(x, 'instr') ?? '');
        if (m) c.link = docLink(m[1]) ?? was;
        inline(ctx, x, c, align);
        c.link = was;
        break;
      }
      case 'sdt': {
        // A box Word ticks: the item is a checklist's; its box is not words.
        const box = all(kid(x, 'sdtPr'), 'checkbox')[0];
        if (box) {
          c.check = true;
          c.checked = ['1', 'true'].includes(att(kid(box, 'checked'), 'val') ?? '0');
          break;
        }
        inline(ctx, kid(x, 'sdtContent') ?? x, c, align);
        break;
      }
      case 'ins':
      case 'moveTo':
      case 'smartTag':
      case 'customXml':
      case 'sdtContent':
      case 'dir':
      case 'bdo':
        inline(ctx, x, c, align);
        break;
      case 'AlternateContent': {
        const ch = kid(x, 'Choice') ?? kid(x, 'Fallback');
        if (ch) inline(ctx, ch, c, align);
        break;
      }
    }
  }
}

function wordParagraph(ctx: WCtx, p: El, out: Record<string, unknown>[], depth: number) {
  const pPr = kid(p, 'pPr');
  const k = pKind(ctx, pPr);
  if (kid(pPr, 'pageBreakBefore') && on(kid(pPr, 'pageBreakBefore')) && out.length) out.push({ type: 'pagebreak' });
  const c: PCollect = { runs: [], after: [], breaks: [] };
  inline(ctx, p, c, k.align);
  let runs = mergeRuns(c.runs);
  // A box drawn as a character starts a checklist's item.
  const glyph = /^\s*([☐☑☒])\s*/.exec(runs[0]?.t ?? '');
  if (glyph && (k.list || runs.length)) {
    c.check = true;
    c.checked = glyph[1] !== '☐';
    runs = mergeRuns([{ ...runs[0], t: runs[0].t.slice(glyph[0].length) }, ...runs.slice(1)]);
  }
  const text = runs.map((r) => r.t).join('');
  // A caption under a picture is the picture's.
  const prevImg = out[out.length - 1];
  if (k.caption && prevImg?.type === 'image' && !prevImg.caption && text.trim() && !c.after.length) {
    prevImg.caption = text.replace(/\s+/g, ' ').trim();
    return;
  }
  // A checklist's item is indented by its level (as docx.ts writes them: half an inch, and a quarter more a level).
  const checkLvl = Math.min(4, Math.max(0, Math.round((k.left - 720) / 360)));
  const block = (rs: Run[]): Record<string, unknown> => {
    if (c.check || k.list) return { type: 'li', list: c.check ? 'check' : k.list!.kind, lvl: k.list?.lvl ?? checkLvl, ...(c.checked ? { checked: true } : {}), ...(k.align ? { align: k.align } : {}), runs: rs };
    const b: Record<string, unknown> = { type: 'p', runs: k.style === 'code' ? [{ t: rs.map((r) => r.t).join('') }] : rs };
    if (k.style !== 'normal') b.style = k.style;
    if (k.align) b.align = k.align;
    if (k.lvl) b.lvl = k.lvl;
    return b;
  };
  // An empty paragraph with a line under or over it is a line across.
  const bdr = kid(pPr, 'pBdr');
  if (!text.trim() && !c.after.length && bdr && (kid(bdr, 'bottom') || kid(bdr, 'top')) && depth === 0) out.push({ type: 'hr' });
  else if (c.breaks.length) {
    // Page breaks inside it: the words before each, a page break, the words after.
    let at = 0;
    const flat = c.runs;
    for (const br of c.breaks) {
      const part = mergeRuns(flat.slice(at, br));
      if (part.some((r) => r.t.trim())) out.push(block(part));
      out.push({ type: 'pagebreak' });
      at = br;
    }
    const rest = mergeRuns(flat.slice(at));
    if (rest.some((r) => r.t.trim())) out.push(block(rest));
  } else if (text || !c.after.length) out.push(block(runs));
  out.push(...c.after);
  // A section that starts on a new page.
  const sect = kid(pPr, 'sectPr');
  if (sect && ['nextPage', 'oddPage', 'evenPage'].includes(att(kid(sect, 'type'), 'val') ?? 'nextPage') && depth === 0) out.push({ type: 'pagebreak' });
}

function wordTable(ctx: WCtx, tbl: El, out: Record<string, unknown>[], depth: number) {
  const rowsOf = (el: El): El[] => kids(el).flatMap((x) => (x.n === 'tr' ? [x] : x.n === 'sdt' || x.n === 'sdtContent' || x.n === 'customXml' ? rowsOf(x) : []));
  const cellsOf = (el: El): El[] => kids(el).flatMap((x) => (x.n === 'tc' ? [x] : x.n === 'sdt' || x.n === 'sdtContent' || x.n === 'customXml' ? cellsOf(x) : []));
  const rows: { runs: Run[]; align?: Align }[][] = [];
  let head = false;
  rowsOf(tbl)
    .slice(0, DOC_LIMITS.rows)
    .forEach((tr, ri) => {
      if (ri === 0 && on(xpath(tr, 'trPr', 'tblHeader'))) head = true;
      const row: { runs: Run[]; align?: Align }[] = [];
      for (const tc of cellsOf(tr)) {
        if (row.length >= DOC_LIMITS.cols) break;
        const inner: Record<string, unknown>[] = [];
        if (depth < 4) wordBody(ctx, tc, inner, depth + 1);
        // A cell's paragraphs are lines of it.
        const runs: Run[] = [];
        let align: Align | undefined;
        for (const b of inner) {
          if (!Array.isArray(b.runs)) continue;
          if (runs.length) runs.push({ t: '\n' });
          runs.push(...(b.runs as Run[]));
          align ??= b.align as Align | undefined;
        }
        const merged = att(xpath(tc, 'tcPr', 'vMerge'), 'val');
        const cont = !!xpath(tc, 'tcPr', 'vMerge') && merged !== 'restart';
        row.push({ runs: cont ? [] : mergeRuns(runs), ...(align && align !== 'left' && !cont ? { align } : {}) });
        for (let s = Number(att(xpath(tc, 'tcPr', 'gridSpan'), 'val')) || 1; s > 1 && row.length < DOC_LIMITS.cols; s--) row.push({ runs: [] });
      }
      if (row.length) rows.push(row);
    });
  if (!rows.length) return;
  // A first row all in bold is a header (its bold the header's own).
  if (!head && rows.length > 1 && rows[0].every((c) => c.runs.every((r) => r.b || !r.t.trim())) && rows[0].some((c) => c.runs.some((r) => r.t.trim()))) {
    head = true;
    rows[0] = rows[0].map((c) => ({ ...c, runs: mergeRuns(c.runs.map(({ b: _b, ...r }) => r)) }));
  }
  const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => Number(att(g, 'w')) || 0);
  const width = Math.max(...rows.map((r) => r.length));
  out.push({ type: 'table', rows, ...(head ? { head: true } : {}), ...(grid.length === width && grid.every((g) => g > 0) ? { cols: grid } : {}) });
}

function wordBody(ctx: WCtx, el: El, out: Record<string, unknown>[], depth: number) {
  for (const x of el.c) {
    if (!isEl(x) || out.length >= DOC_LIMITS.blocks) continue;
    switch (x.n) {
      case 'p':
        wordParagraph(ctx, x, out, depth);
        break;
      case 'tbl':
        if (depth) {
          // A table in a table's cell: its rows as lines.
          const inner: Record<string, unknown>[] = [];
          wordTable(ctx, x, inner, depth);
          const t = inner[0] as { rows?: { runs: Run[] }[][] } | undefined;
          for (const r of t?.rows ?? []) out.push({ type: 'p', runs: mergeRuns(r.flatMap((c, i) => (i ? [{ t: '\t' }, ...c.runs] : c.runs))) });
        } else wordTable(ctx, x, out, depth);
        break;
      case 'sdt':
        wordBody(ctx, kid(x, 'sdtContent') ?? x, out, depth);
        break;
      case 'customXml':
      case 'ins':
      case 'moveTo':
      case 'sdtContent':
        wordBody(ctx, x, out, depth);
        break;
      case 'AlternateContent': {
        const ch = kid(x, 'Choice') ?? kid(x, 'Fallback');
        if (ch) wordBody(ctx, ch, out, depth);
        break;
      }
    }
  }
}

function wordDoc(buf: Buffer): Doc {
  let zip: Zip;
  try {
    zip = new Zip(buf);
  } catch {
    throw new Error('This is not a Word document (.docx)');
  }
  const root = rels(zip, '');
  const mainRel = [...root.values()].find((x) => x.type === 'officeDocument')?.target;
  const main = mainRel && zip.has(mainRel) ? mainRel : 'word/document.xml';
  const xml = zip.text(main);
  if (!xml) throw new Error('This Word file has no document in it');
  const r = rels(zip, main);
  const part = (type: string) => [...r.values()].find((x) => x.type === type)?.target;

  const styles = new Map<string, WStyle>();
  const sx = zip.text(part('styles') ?? 'word/styles.xml');
  const sroot = sx ? parseXml(sx).root : undefined;
  for (const s of all(sroot, 'style')) {
    const id = att(s, 'styleId');
    if (!id) continue;
    const pPr = kid(s, 'pPr');
    const numPr = kid(pPr, 'numPr');
    const outline = att(kid(pPr, 'outlineLvl'), 'val');
    styles.set(id, {
      name: att(kid(s, 'name'), 'val') ?? id,
      basedOn: att(kid(s, 'basedOn'), 'val'),
      outline: outline !== undefined ? Number(outline) : undefined,
      numId: att(kid(numPr, 'numId'), 'val'),
      ilvl: att(kid(numPr, 'ilvl'), 'val') !== undefined ? Number(att(kid(numPr, 'ilvl'), 'val')) : undefined,
      rPr: kid(s, 'rPr'),
    });
  }

  const nums = new Map<string, Map<number, { fmt: string; text: string }>>();
  const nx = zip.text(part('numbering') ?? 'word/numbering.xml');
  if (nx) {
    const nroot = parseXml(nx).root;
    const abstract = new Map<string, Map<number, { fmt: string; text: string }>>();
    for (const a of kids(nroot, 'abstractNum')) {
      const lv = new Map<number, { fmt: string; text: string }>();
      for (const l of kids(a, 'lvl')) lv.set(Number(att(l, 'ilvl') ?? 0), { fmt: att(kid(l, 'numFmt'), 'val') ?? 'decimal', text: att(kid(l, 'lvlText'), 'val') ?? '' });
      abstract.set(att(a, 'abstractNumId') ?? '', lv);
    }
    for (const n of kids(nroot, 'num')) {
      const lv = new Map(abstract.get(att(kid(n, 'abstractNumId'), 'val') ?? '') ?? []);
      for (const o of kids(n, 'lvlOverride')) {
        const l = kid(o, 'lvl');
        if (l) lv.set(Number(att(o, 'ilvl') ?? 0), { fmt: att(kid(l, 'numFmt'), 'val') ?? 'decimal', text: att(kid(l, 'lvlText'), 'val') ?? '' });
      }
      nums.set(att(n, 'numId') ?? '', lv);
    }
  }

  // The theme's fonts (styles name them as "the theme's body font").
  const theme: { major?: string; minor?: string } = {};
  const tx = zip.text(part('theme') ?? 'word/theme/theme1.xml');
  if (tx) {
    const troot = parseXml(tx).root;
    theme.major = att(kid(all(troot, 'majorFont')[0], 'latin'), 'typeface') || undefined;
    theme.minor = att(kid(all(troot, 'minorFont')[0], 'latin'), 'typeface') || undefined;
  }

  const { root: droot } = parseXml(xml);
  const body = kid(droot, 'body') ?? droot;
  // The paper and margins, from the last section.
  const sect = kids(body, 'sectPr').pop() ?? all(body, 'sectPr').pop();
  const pw = Number(att(kid(sect, 'pgSz'), 'w')) || 11906;
  const ph = Number(att(kid(sect, 'pgSz'), 'h')) || 16838;
  const letter = Math.abs(Math.min(pw, ph) - 12240) < Math.abs(Math.min(pw, ph) - 11906) && Math.abs(Math.max(pw, ph) - 15840) < 400;
  const left = Number(att(kid(sect, 'pgMar'), 'left')) || 1440;
  const right = Number(att(kid(sect, 'pgMar'), 'right')) || left;
  const margin = Math.round(((left + right) / 2 / 56.6929) * 10) / 10;

  // The document's font and size: its defaults', or its Normal style's.
  const defaults = all(sroot, 'rPrDefault')[0];
  const normal = [...styles.entries()].find(([id, s]) => id === 'Normal' || s.name.toLowerCase() === 'normal')?.[1];
  const defLook: Look = {};
  const ctx: WCtx = { zip, rels: r, styles, nums, theme, font: 'Arial', size: 11, textEmu: Math.max(1, pw - left - right) * 635, pics: 0 };
  rLook(ctx, kid(defaults, 'rPr'), defLook);
  rLook(ctx, normal?.rPr, defLook);
  const font = defLook.font && FONTS.some((f) => f.name.toLowerCase() === defLook.font!.toLowerCase()) ? FONTS.find((f) => f.name.toLowerCase() === defLook.font!.toLowerCase())!.name : (defLook.font ?? 'Arial');
  ctx.font = font;
  ctx.size = defLook.size ?? 11;

  const out: Record<string, unknown>[] = [];
  wordBody(ctx, body, out, 0);
  // A document's last empty paragraphs are left out.
  while (out.length > 1 && out[out.length - 1].type === 'p' && !(out[out.length - 1].runs as Run[]).some((x) => x.t.trim())) out.pop();
  if (out[out.length - 1]?.type === 'pagebreak') out.pop();
  return normalizeDoc({ page: { size: letter ? 'letter' : 'a4', margin }, font, size: ctx.size, blocks: out });
}

/** The characters of a document's words (its paragraphs, items, tables' cells and captions). */
function docChars(d: Doc): number {
  let n = 0;
  for (const b of d.blocks) {
    if (b.type === 'p' || b.type === 'li') n += b.runs.reduce((k, r) => k + r.t.length, 0);
    else if (b.type === 'table') for (const row of b.rows) for (const c of row) n += c.runs.reduce((k, r) => k + r.t.length, 0);
    else if (b.type === 'image') n += (b.caption ?? '').length;
  }
  return n;
}

/**
 * What of a Word file a document here does not hold, so that the document editor saving over it would lose it (keys
 * Files words for the person: "headers" for headers and footers, "footnotes", "comments", "changes" for tracked
 * changes, which come in as they read, "equations", "charts", "diagrams" for SmartArt, "objects" for embedded files,
 * "boxes" for text boxes, whose words come in after their paragraph, "columns", "toc" for a table of contents that
 * updates, "layout" for pages laid out apart, such as a landscape section); and `cut`, whether `doc`, read from it,
 * came in short of its words (a document longer than one here may be).
 */
export function wordLosses(buf: Buffer, doc: Doc): { loses: string[]; cut: boolean } {
  const zip = new Zip(buf);
  const mainRel = [...rels(zip, '').values()].find((x) => x.type === 'officeDocument')?.target;
  const main = mainRel && zip.has(mainRel) ? mainRel : 'word/document.xml';
  const xml = zip.text(main) ?? '';
  const r = [...rels(zip, main).values()];
  const loses = new Set<string>();
  const words = /<w:t(?:\s[^>]*)?>[^<]*\S/;
  if (r.some((x) => (x.type === 'header' || x.type === 'footer') && words.test(zip.text(x.target) ?? ''))) loses.add('headers');
  if (/<w:(?:footnote|endnote)Reference[\s/>]/.test(xml)) loses.add('footnotes');
  if (/<w:comment(?:Reference|RangeStart)[\s/>]/.test(xml)) loses.add('comments');
  if (/<w:(?:ins|del|moveFrom|moveTo)\s[^>]*w:author=/.test(xml)) loses.add('changes');
  if (/<m:oMath[\s>]/.test(xml)) loses.add('equations');
  if (r.some((x) => x.type === 'chart') || /<c:chart[\s/>]/.test(xml)) loses.add('charts');
  if (r.some((x) => x.type === 'diagramData')) loses.add('diagrams');
  if (r.some((x) => x.type === 'oleObject' || x.type === 'package') || /<o:OLEObject[\s/>]/.test(xml)) loses.add('objects');
  if (/<w:txbxContent[\s>]/.test(xml)) loses.add('boxes');
  if (/<w:cols\s[^>]*w:num="(?:[2-9]|\d{2,})"/.test(xml)) loses.add('columns');
  if (/<w:instrText(?:\s[^>]*)?>\s*TOC\b|w:instr="\s*TOC\b/.test(xml)) loses.add('toc');
  const sizes = new Set([...xml.matchAll(/<w:pgSz\s[^>]*?\/>/g)].map((m) => m[0].replace(/\s+w:code="[^"]*"/, '')));
  if (sizes.size > 1 || /<w:pgSz\s[^>]*w:orient="landscape"/.test(xml)) loses.add('layout');
  // Its words, against the document's: a text box's other drawing (Fallback) holds its words twice, and is not read.
  const chars = [...xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '').matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].reduce((n, m) => n + m[1].replace(/&[#\w]{1,8};/g, '_').length, 0);
  const cut = doc.blocks.length >= DOC_LIMITS.blocks || docChars(doc) < chars * 0.98 - 50;
  return { loses: [...loses], cut };
}

// ---- the agent's tool ---------------------------------------------------------------------------------------------

const DOC_HELP = [
  'Make or change a document, kept in the user’s Library: they read it in the conversation and in the Library, edit it there as in Word or Google Docs, print it, and export it as Word (.docx), PDF or Markdown. Use it for letters, reports, CVs, essays, notes, contracts, handouts, minutes, plans and anything else the user will read, edit or print, rather than writing a .docx file (unless they ask for a file, or work on one they have).',
  'Write it as markdown: # Heading 1 to #### Heading 4, paragraphs, **bold**, *italic*, <u>underline</u>, ~~struck~~, `code`, [links](https://…), ==highlighted==, H<sub>2</sub>O and x<sup>2</sup>; - bullets, 1. numbers, - [ ] and - [x] checklists (two more spaces before the marker for a level deeper); > quotes; ``` code blocks; tables as | a | b | over | --- | --- | (:---: centres a column, wider dashes make a wider column); --- for a line across; \\pagebreak alone on a line to start a new page.',
  'Braces at the end of a paragraph or heading say what Markdown cannot: {.title} makes it the document’s title, {.subtitle} its subtitle, {.center}, {.right} or {.justify} aligns it, {indent=1} indents it a step. Colours, sizes and fonts: <span style="color:#c5221f; background-color:#fde68a; font-size:14pt; font-family:Georgia">words</span>.',
  'Pictures: ![what it shows](src "its caption"){width=50% .left} on a line of their own (centred, the text’s width, unless said); src is a file of this session (a picture you made), a public https address, or a picture the document has already (naget-asset:…).',
  'Instead of markdown you may give blocks: [{"title": "…"}, {"h1": "…"}, {"p": "…"}, {"bullet": "…", "lvl": 1}, {"number": "…"}, {"check": "…", "checked": true}, {"bullets": ["…", ["a level deeper"]]}, {"quote": "…"}, {"code": "…"}, {"table": [["Head", "Head"], ["a", "b"]], "head": true}, {"image": "src", "caption": "…", "width": 0.5}, {"hr": true}, {"pagebreak": true}]; their words are markdown too.',
  'page: {"size": "a4" or "letter", "margin": millimetres} (A4 and 25.4 mm unless said); font: the body text’s (Arial unless said; others: Georgia, Times New Roman, Inter, Roboto, Open Sans, Lato, Merriweather, Lora, Source Serif 4…); size: the body text’s in points (11). Headings and the title are sized from it.',
  'Good documents start with a title, have short headings that say what follows, short paragraphs, lists for steps and options, and tables for what is compared.',
  'To change a document, get_page with its id gives it as markdown; send the whole document back with save_doc and the same id: a new version, the older ones restorable. Keep what the user changed, and what you were not asked to change, as it is.',
].join(' ');

export const SAVE_DOC_DESCRIPTION = DOC_HELP;

export const SAVE_DOC_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved document’s id, to save a new version of it.' },
    title: { type: 'string', description: 'The document’s name in the Library: "Offer letter".' },
    markdown: { type: 'string', description: 'The whole document, in Markdown (as above).' },
    blocks: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'object' }] }, description: 'Instead of markdown: the document’s blocks, in order.' },
    page: { description: '{"size": "a4" | "letter", "margin": mm}, or "a4" or "letter".', anyOf: [{ type: 'string' }, { type: 'object' }] },
    font: { type: 'string', description: 'The body text’s font: "Arial", "Georgia"…' },
    size: { type: 'number', description: 'The body text’s size in points: 11.' },
  },
  required: ['title'],
};
