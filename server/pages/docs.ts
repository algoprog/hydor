// Documents in Pages: a page of the kind "doc" keeps its document (shared/docs.ts) as text, a line per block, its
// pictures apart (assets.ts). Wherever a page's HTML is needed (the frame in the conversation, its own address, a
// published copy, its picture in Pages, a PDF), the document's own page is made from it: its sheets of paper with
// the pictures inside (viewer), its pages as they print (print), or the top of its first page (still). It exports
// as Word (docx.ts writes the file) and Markdown, and is made from Word, Markdown, text and HTML files.
//
// save_doc is how agents make and change documents; get_page gives one back as Markdown, which says all a
// document holds but its blocks' ids (carried over from the version it changes when it comes back). Agents answer the
// comments and the suggested changes, and may suggest their own changes rather than make them.
import { authorForAgent, cleanAuthor, newCommentId, peopleNote } from '../../shared/comments.ts';
import { changesOf, compareDocs, suggestionColor } from '../../shared/doc-changes.ts';
import {
  ASSET,
  blockHtml,
  blockText,
  cleanIcon,
  CALLOUT,
  leadingIcon,
  withComments,
  withSuggestions,
  type Block,
  type Comment,
  fixMerges,
  fontCss,
  tocEntries,
  type Band,
  type TableBlock,
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
  resolveSuggestion,
  type Suggestion,
  STYLES,
  type Align,
  type Doc,
  type Look,
  type ParaStyle,
  type Run,
} from '../../shared/docs.ts';
import { FONTS, googleFamilies } from '../../shared/slides.ts';
import { docRefs, type Refs } from '../../shared/doc-refs.ts';
import { bookmarkName, citationOf, sourcesFromXml, watermarkOf } from './docx-parts.ts';
import { paginateDoc } from '../../shared/doc-paginate.ts';
import { citeItems, citeOf, cleanSources, COLUMN_GAP, notesHtml, paperOf, styleOf, type Source } from '../../shared/docs.ts';
import { CITE_STYLE_NAMES, sourceFromBibtex, sourceLine } from '../../shared/doc-cite.ts';
import { scriptSafe } from './kit.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { rels } from '../documents/ooxml.ts';
import { all, att, isEl, kid, kids, parseXml, patt, path as xpath, type El } from '../documents/xml.ts';
import { Zip } from '../documents/zip.ts';
import { assetDataUrl, getAsset, pictureType, putAsset, takeIn } from './assets.ts';
import { authorOf, docxFile, editorStylesXml, MONO_DOC, type DocBlock as WordBlock, type DocCell, type DocLook, type DocRev, type DocRun as WordRun, type DocSpace } from './docx.ts';
import { katexStyle, texToHtml } from './math.ts';
import { DOC_EDITS_HELP } from '../../shared/doc-edits.ts';
import { texOfOmml } from './omml.ts';
import { imageSize } from './ooxml.ts';
import type { Picture } from './pptx.ts';
import { wordLine, type EmbeddedFont, type FontFace } from './word-fonts.ts';
import { grows, ownLine, wordLineOf, wordPlaces } from './word-layout.ts';

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
  const notes: string[] = [];
  // Its header, footer and title page as they were, unless they are said; its comments as they were, answered,
  // resolved or added to as `comments` says.
  const given = (k: string) => Object.prototype.hasOwnProperty.call(v, k);
  const comments = commentOps(base?.comments ?? [], v.comments, notes);
  // The suggestions it had, and new ones the agent marks in what it sends (ids it has not: its own, made now).
  const now = Date.now();
  const had = base?.suggestions ?? [];
  const known = new Set(had.map((x) => x.id));
  const marked = new Set<string>();
  const raw = JSON.stringify([v.markdown ?? '', v.blocks ?? []]);
  for (const m of raw.matchAll(/data-s=\\?"([A-Za-z0-9_-]{1,40})\\?"|\b(?:ins|del)=([A-Za-z0-9_-]{1,40})\b|\\?"(?:ins|del|fmt)\\?":\\?"([A-Za-z0-9_-]{1,40})\\?"/g)) marked.add(m[1] ?? m[2] ?? m[3]);
  const suggestions: Suggestion[] = [...had, ...[...marked].filter((id) => !known.has(id)).map((id) => ({ id, by: 'agent' as const, at: now }))];
  let doc: Doc;
  try {
    // Any source may be a file of the session's: kept as written until it is taken in below.
    doc = normalizeDoc(
      {
        markdown: v.markdown,
        blocks: v.blocks,
        page,
        font: v.font ?? base?.font,
        size: v.size ?? base?.size,
        header: given('header') ? v.header : base?.header,
        footer: given('footer') ? v.footer : base?.footer,
        titlePage: given('titlePage') ? v.titlePage : base?.titlePage,
        comments: comments.list,
        suggestions,
        // Its sources (those sent added to the ones it had, by key), citation style, styles and watermark, as they were unless sent.
        sources: agentSources(base?.sources ?? [], v.sources, v.bibtex, notes),
        cite: v.cite ?? v.citeStyle ?? base?.cite,
        styles: given('styles') ? v.styles : base?.styles,
        watermark: given('watermark') ? v.watermark : base?.mark,
      },
      { src: (s) => (s.length <= 4096 ? s : null) },
    );
  } catch (e) {
    throw new Error(`${(e as Error).message} See save_doc’s description for the document’s shape.`);
  }
  doc = anchorComments(doc, comments.on, notes);
  if (base) doc = keepBlockMarks(base, carryIds(base, doc));
  // Its changes as suggestions of its own (the version it changes compared with what it sends), where it asks.
  if (base && v.suggest === true) doc = compareDocs(base, doc, { by: 'agent', at: now }, `a${now.toString(36)}`);
  doc = suggestionOps(doc, v.suggestions, notes, now);
  const done = new Map<string, string>();
  for (const s of new Set(docSources(doc))) done.set(s, await takeIn(db, s, { cwd, notes }));
  doc = notEmpty(mapDocSources(doc, (s) => done.get(s) ?? s));
  const text = docText(doc);
  if (Buffer.byteLength(text) > MAX_DOC) throw new Error(`The document is over ${MAX_DOC / 1024 / 1024} MB without its pictures; make it smaller.`);
  return { doc, text, notes };
}

/** The sources an agent sends (objects, or BibTeX entries: a string, or a list), added to those the document has, by key. */
function agentSources(had: Source[], given: unknown, bibtex: unknown, notes: string[]): Source[] {
  const add: unknown[] = [];
  const bib = (t: string) => {
    for (const e of t.split(/(?=@[A-Za-z]+\s*[{(])/)) {
      if (!e.trim()) continue;
      const src = sourceFromBibtex(e);
      if (src) add.push(src);
      else notes.push(`A BibTeX entry could not be read: “${e.trim().slice(0, 60)}…”.`);
    }
  };
  if (typeof bibtex === 'string') bib(bibtex);
  for (const x of Array.isArray(given) ? given : []) typeof x === 'string' ? bib(x) : add.push(x);
  const fresh = cleanSources(add);
  if (add.length > fresh.length) notes.push('Some sources were left out: each needs a key (id), a title and a kind (article, book, chapter, conference, thesis, report, web or other).');
  const keys = new Set(fresh.map((x) => x.id.toLowerCase()));
  return [...had.filter((x) => !keys.has(x.id.toLowerCase())), ...fresh];
}

/**
 * Comments after an agent's changes (`ops`, save_doc's comments): {id, reply} answers one, {id, resolve: true} or
 * {id, reopen: true} resolves or reopens it, {id, delete: true} takes it out, and {id, text} with a new id adds one of
 * the agent's (on the words marked <span data-comment="id">, or on the words `on`). What it could not do is said in
 * `notes`; the words new comments are on, by their ids, in `on`.
 */
function commentOps(list: Comment[], ops: unknown, notes: string[]): { list: Comment[]; on: Map<string, string> } {
  const out: Comment[] = list.map((c) => (c.replies ? { ...c, replies: [...c.replies] } : { ...c }));
  const on = new Map<string, string>();
  if (ops === undefined || ops === null) return { list: out, on };
  if (!Array.isArray(ops)) {
    notes.push('comments must be a list of changes, such as [{"id": "c1", "reply": "…"}]: they were left as they were.');
    return { list: out, on };
  }
  const now = Date.now();
  for (const raw of ops.slice(0, 500)) {
    const op = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const id = typeof op.id === 'string' ? op.id.trim() : '';
    const c = out.find((x) => x.id === id);
    const text = (k: string) => (typeof op[k] === 'string' ? (op[k] as string).trim().slice(0, 4000) : '');
    if (c) {
      if (op.delete === true) out.splice(out.indexOf(c), 1);
      else {
        if (text('reply')) (c.replies ??= []).push({ id: `${c.id}r${(c.replies?.length ?? 0) + 1}${now.toString(36).slice(-3)}`, by: 'agent', text: text('reply'), at: now });
        if (op.resolve === true || op.resolved === true) c.resolved = true;
        if (op.reopen === true || op.resolved === false) delete c.resolved;
        if (!text('reply') && op.resolve === undefined && op.resolved === undefined && op.reopen === undefined && text('text')) notes.push(`Comment ${id} is the user’s: answer it with "reply", not "text".`);
      }
      continue;
    }
    if (op.delete === true || text('reply') || op.resolve !== undefined || op.reopen !== undefined) {
      notes.push(`There is no comment ${id || '(no id)'} to change: get_page lists them.`);
      continue;
    }
    const words = text('text');
    if (!words) continue;
    const nid = /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : newCommentId();
    out.push({ id: nid, by: 'agent', text: words, at: now });
    if (text('on')) on.set(nid, text('on'));
  }
  return { list: out, on };
}

/**
 * Suggested changes of blocks Markdown has no way to mark (a line across, a page break, a table of contents, an
 * equation, code) kept from the version an agent changes, where it sent the block back as it was.
 */
function keepBlockMarks(base: Doc, doc: Doc): Doc {
  const before = new Map(base.blocks.map((b) => [b.id, b]));
  const same = (a: Block, b: Block) => {
    const { id: _a, ins: _ai, del: _ad, ...x } = a;
    const { id: _b, ins: _bi, del: _bd, ...y } = b;
    return JSON.stringify(x) === JSON.stringify(y);
  };
  const blocks = doc.blocks.map((b) => {
    const was = before.get(b.id);
    if (!was || b.ins || b.del || (!was.ins && !was.del) || !same(was, b)) return b;
    const noAttrs = b.type === 'hr' || b.type === 'pagebreak' || b.type === 'toc' || b.type === 'math' || (b.type === 'p' && b.style === 'code');
    return noAttrs ? { ...b, ...(was.ins ? { ins: was.ins } : {}), ...(was.del ? { del: was.del } : {}) } : b;
  });
  return withSuggestions({ ...doc, blocks }, [...(doc.suggestions ?? []), ...(base.suggestions ?? []).filter((x) => !doc.suggestions?.some((y) => y.id === x.id))]);
}

/**
 * Suggested changes after an agent's answers (save_doc's suggestions): {id, accept: true} makes one's change, {id,
 * reject: true} undoes it, {id, reply} answers it. What it could not do is said in `notes`.
 */
function suggestionOps(doc: Doc, ops: unknown, notes: string[], now: number): Doc {
  if (ops === undefined || ops === null) return doc;
  if (!Array.isArray(ops)) {
    notes.push('suggestions must be a list, such as [{"id": "s1", "accept": true}]: they were left as they were.');
    return doc;
  }
  let d = doc;
  for (const raw of ops.slice(0, 500)) {
    const op = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const id = typeof op.id === 'string' ? op.id.trim() : '';
    const sg = d.suggestions?.find((x) => x.id === id);
    if (!sg) {
      notes.push(`There is no suggestion ${id || '(no id)'} to answer: get_page lists them.`);
      continue;
    }
    const reply = typeof op.reply === 'string' ? op.reply.trim().slice(0, 4000) : '';
    if (reply) d = { ...d, suggestions: d.suggestions!.map((x) => (x.id === id ? { ...x, replies: [...(x.replies ?? []), { id: `${id}r${(x.replies?.length ?? 0) + 1}${now.toString(36).slice(-3)}`, by: 'agent' as const, text: reply, at: now }] } : x)) };
    if (op.accept === true) d = resolveSuggestion(d, id, true);
    else if (op.reject === true) d = resolveSuggestion(d, id, false);
  }
  return d;
}

/**
 * New comments put on the words they name (where the document has no marks for them yet: the first place those
 * words are), and each comment's quote made from the words it is on; a new one on no words is said.
 */
export function anchorComments(doc: Doc, on: Map<string, string>, notes: string[]): Doc {
  if (!doc.comments?.length) return doc;
  const marked = new Set<string>();
  const each = (f: (runs: Run[]) => Run[]) =>
    doc.blocks.map((b): Block => {
      if (b.type === 'p' || b.type === 'li') return { ...b, runs: f(b.runs) };
      if (b.type === 'table') return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, runs: f(c.runs) }))) };
      return b;
    });
  each((runs) => {
    for (const r of runs) for (const id of r.cm ?? []) marked.add(id);
    return runs;
  });
  let blocks = doc.blocks;
  for (const [id, words] of on) {
    if (marked.has(id)) continue;
    let done = false;
    blocks = each((runs) => {
      if (done) return runs;
      const text = runs.map((r) => (r.math ? '\u2063'.repeat(r.t.length) : r.t)).join('');
      const at = text.indexOf(words);
      if (at < 0) return runs;
      done = true;
      const out: Run[] = [];
      let o = 0;
      for (const r of runs) {
        const a = Math.max(at, o);
        const z = Math.min(at + words.length, o + r.t.length);
        if (z <= a || r.math) out.push(z > a && r.math ? { ...r, cm: [...(r.cm ?? []), id] } : r);
        else {
          if (a > o) out.push({ ...r, t: r.t.slice(0, a - o) });
          out.push({ ...r, t: r.t.slice(a - o, z - o), cm: [...(r.cm ?? []), id] });
          if (z < o + r.t.length) out.push({ ...r, t: r.t.slice(z - o) });
        }
        o += r.t.length;
      }
      return mergeRuns(out);
    });
    doc = { ...doc, blocks };
    if (done) marked.add(id);
    else notes.push(`The words of comment ${id} (“${words.slice(0, 60)}”) are not in the document: it is kept, on no words.`);
  }
  // Each comment's quote: the words it is on now.
  const quotes = new Map<string, string>();
  each((runs) => {
    for (const r of runs) for (const id of r.cm ?? []) quotes.set(id, `${quotes.get(id) ?? ''}${r.math ? '…' : r.t}`);
    return runs;
  });
  return withComments(doc, (doc.comments ?? []).map((c) => (quotes.get(c.id)?.trim() ? { ...c, quote: quotes.get(c.id)!.replace(/\s+/g, ' ').trim().slice(0, 500) } : c)));
}

// ---- its own page -------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const PX_MM = 96 / 25.4;

/** How the sheets of paper sit on the page around them, for each way the page shows. */
function pageCss(doc: Doc, mode: 'viewer' | 'print' | 'still'): string {
  const paper = paperOf(doc.page);
  const m = doc.page.margin;
  const w = Math.round(paper.w * PX_MM);
  const base = [
    'html,body{margin:0;padding:0}',
    'body{background:var(--n-bg,#eceae6);-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'html[data-n-theme=dark] body{background:#000000}',
    '.nd-doc{padding:24px 16px 32px;box-sizing:border-box}',
    `.nd-sheet{box-sizing:border-box;background:${doc.page.color ?? '#fff'};width:${paper.w}mm;max-width:none;margin:0 auto 20px;padding:${m}mm;` +
      'box-shadow:0 1px 3px rgba(0,0,0,.12),0 10px 30px rgba(0,0,0,.07);border-radius:2px}',
    '.nd-sheet:last-child{margin-bottom:0}',
    // The header and footer on each sheet's margins (in print, on every page's, below).
    '.nd-sheet{position:relative}',
    `.nd-band{position:absolute;left:${m}mm;right:${m}mm;height:${m}mm;display:flex;align-items:center;font-family:${fontCss(doc.font)};font-size:${bandPt(doc)}pt;color:#5f6368;white-space:pre;overflow:hidden}`,
    '.nd-band.nd-head{top:0}.nd-band.nd-foot{bottom:0}.nd-band.nd-center{justify-content:center}.nd-band.nd-right{justify-content:flex-end}',
    // A sheet's first block starts at the top of its words, as the editor's does, its header and footer before it or not.
    '.nd-sheet>.nd-band+.nd-b,.nd-sheet>.nd-band+.nd-band+.nd-b{margin-top:0}',
    // Words in columns; the footnotes at the end, under a short line; the watermark across the middle of each sheet.
    `.nd-cols{column-count:${doc.page.cols ?? 1};column-gap:${COLUMN_GAP}mm}`,
    '.nd-cols>.nd-b{break-inside:avoid}',
    '.nd-endnotes{margin-top:1.5em;padding-top:.6em;border-top:1px solid #c8ccd1;width:33%;min-width:12em}',
    '.nd-endnotes .nd-notes{width:300%;max-width:calc(100vw - 4em)}',
    '.nd-wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}',
    '.nd-wm span{transform:rotate(-45deg);font:700 var(--wm,96px)/1 Arial,sans-serif;color:rgba(0,0,0,.075);white-space:nowrap;letter-spacing:.04em}',
    '.nd-wm img{max-width:60%;max-height:55%;object-fit:contain;opacity:.16}',
    // A paragraph that goes on from the page before: no mark of a list again.
    '.nd-doc .nd-li.nd-cont::before{content:none}.nd-doc .nd-cont{margin-top:0}',
  ];
  if (mode === 'print') return [...base, printCss(doc)].join('\n');
  if (mode === 'still') {
    // The top of the first page, large enough to read in the list's picture.
    const zoom = Math.round((1040 / w) * 100) / 100;
    return [...base, 'html,body{overflow:hidden;background:#e8e6e1!important}', '.nd-doc{padding:56px 0 0}', `.nd-sheet{zoom:${zoom};min-height:${paper.h}mm;box-shadow:0 1px 4px rgba(0,0,0,.14)}`].join('\n');
  }
  // In a narrower frame the sheet is drawn smaller; on a phone its words fill the width instead (on screens: printed,
  // it is its pages).
  const fit = [0.92, 0.85, 0.78, 0.72]
    .map((k, i, all) => `@media screen and (max-width:${Math.round(w * (i ? all[i - 1] : 1) + 32)}px){.nd-sheet{zoom:${k}}}`)
    .join('\n');
  return [
    ...base,
    fit,
    // There, a table's columns take what their words need, not the widths set for the paper.
    `@media screen and (max-width:${Math.round(w * 0.72 + 31)}px){.nd-doc{padding:0;--nd-step:22pt}.nd-sheet{zoom:1;width:auto;padding:22px 18px 28px;margin:0 0 8px;box-shadow:none;border-radius:0}.nd-band{display:none}.nd-doc table.nd-table{table-layout:auto}.nd-doc .nd-table col{width:auto!important}}`,
  ].join('\n');
}

/** How the document prints: its paper and margins, its header and footer on every page, its sheets as pages, what belongs together kept together. */
function printCss(doc: Doc): string {
  return [
    `@page{size:${doc.page.size === 'letter' ? 'letter' : 'A4'}${doc.page.orient === 'landscape' ? ' landscape' : ''};margin:${doc.page.margin}mm;${marginBoxes(doc)}}`,
    doc.titlePage ? '@page:first{@top-left{content:none}@top-center{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-center{content:none}@bottom-right{content:none}}' : '',
    '.nd-band{display:none}',
    `html,body{background:${doc.page.color ?? '#fff'}!important}`,
    // The watermark on every printed page (a fixed element prints on each).
    '.nd-sheet .nd-wm{display:none}.nd-wm-print{display:flex!important;position:fixed}',
    '.nd-doc{padding:0}',
    '.nd-sheet{width:auto;padding:0;margin:0;box-shadow:none;border-radius:0;zoom:1}',
    '.nd-sheet+.nd-sheet{break-before:page}',
    '.nd-doc tr,.nd-doc figure,.nd-doc .nd-hr,.nd-doc pre.nd-b,.nd-doc .nd-math,.nd-doc .nd-callout{break-inside:avoid}',
    '.nd-doc thead{display:table-header-group}',
    '.nd-doc h1,.nd-doc h2,.nd-doc h3,.nd-doc h4,.nd-doc .nd-title,.nd-doc .nd-subtitle{break-after:avoid}',
    '.nd-doc .nd-b{orphans:2;widows:2}',
  ].join('\n');
}

/** A header's or footer's size: a little smaller than the words. */
const bandPt = (doc: Doc) => Math.round(doc.size * 0.82 * 2) / 2;

/** Words as a CSS string, safe inside a <style> (no way out of it, nor of the string). */
const cssText = (s: string) => `"${s.replace(/[\\"<>\n\r]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;

/** A header's or footer's words as CSS content: its words, and the page's number and count where it says {page} and {pages}. */
function bandContent(text: string): string {
  const parts = text.split(/(\{pages?\})/i).filter(Boolean);
  return parts.map((p) => (/^\{page\}$/i.test(p) ? 'counter(page)' : /^\{pages\}$/i.test(p) ? 'counter(pages)' : cssText(p))).join(' ') || '""';
}

/** The printed pages' header and footer, as Chromium draws them in the page's margins. */
function marginBoxes(doc: Doc): string {
  const box = (where: 'top' | 'bottom', b: Band | undefined) =>
    b ? `@${where}-${b.align ?? 'left'}{content:${bandContent(b.text)};font-family:${fontCss(doc.font)};font-size:${bandPt(doc)}pt;color:#5f6368;vertical-align:middle}` : '';
  return box('top', doc.header) + box('bottom', doc.footer);
}

/** A header or footer drawn on a sheet of the page as it reads (its page's number: the sheet's). */
function bandHtml(b: Band | undefined, kind: 'head' | 'foot', page: number, pages: number): string {
  if (!b) return '';
  const text = b.text.replace(/\{page\}/gi, String(page)).replace(/\{pages\}/gi, String(pages));
  return `<div class="nd-band nd-${kind}${b.align ? ` nd-${b.align}` : ''}">${esc(text)}</div>`;
}

/** The suggested changes in the colours of who suggested each (ids and colours of a known form only). */
const suggestionsCss = (doc: Doc) => (doc.suggestions ?? []).map((x) => `\n.nd-doc [data-s="${x.id}"]{--sc:${suggestionColor(x)}}`).join('');

/** Whether a document has maths in it (an equation, or maths among its words). */
export function docHasMath(d: Doc): boolean {
  const inRuns = (runs: Run[]) => runs.some((r) => r.math);
  return d.blocks.some((b) => b.type === 'math' || ((b.type === 'p' || b.type === 'li') && inRuns(b.runs)) || (b.type === 'table' && b.rows.some((r) => r.some((c) => inRuns(c.runs)))));
}

/**
 * The document's own page: its sheets of paper to read (`viewer`, in a frame or on its own; a page break starts
 * another sheet), its pages to print as Chromium makes them a PDF (`print`: its paper and margins, its header and
 * footer on every page with the page's number, page breaks where it has them, tables' rows, pictures and code kept
 * whole; a table of contents' lines link to their headings), or the top of its first page (`still`, its picture in
 * Pages, at 1280×800). Its pictures go inside it, and its maths is drawn here with KaTeX's fonts inside it; nothing
 * in it is markup or a script but what this writes. Printed from a browser, the page as it reads prints as its pages.
 */
export function docPage(db: DB, doc: Doc, title: string, mode: 'viewer' | 'print' | 'still' = 'viewer'): string {
  const inside = mapDocSources(doc, (s) => (s.startsWith(ASSET) ? (assetDataUrl(db, s.slice(ASSET.length)) ?? '') : s));
  const { labels } = listInfo(inside.blocks);
  // Footnotes' numbers, citations, cross-references, numbered captions and the bibliography, as the editor draws them.
  const refs = docRefs(inside);
  const draw = { src: (s: string) => s, math: texToHtml, toc: tocEntries(inside), refs };
  const sheets: string[][] = [[]];
  for (let i = 0; i < inside.blocks.length; i++) {
    const b = inside.blocks[i];
    if (b.type === 'pagebreak') {
      if (mode === 'still') break;
      sheets.push([]);
      continue;
    }
    if (mode === 'still' && sheets[0].length >= 60) break;
    sheets[sheets.length - 1].push(blockHtml(b, labels[i], draw));
  }
  const fams = googleFamilies(docFonts(inside));
  const cols = (doc.page.cols ?? 1) > 1;
  const notes = refs && inside.notes?.some((n) => refs.note(n.id) > 0) ? notesHtml(inside, refs, { view: true, math: texToHtml }) : '';
  // Printed with footnotes at their pages' foot, or in columns: laid out page by page in the page itself (doc-paginate.ts).
  const paged = mode === 'print' && (!!notes || cols);
  const wm = inside.mark ? `<div class="nd-wm">${inside.mark.src ? `<img src="${esc(inside.mark.src)}" alt="">` : `<span style="--wm:${Math.round(Math.min(160, 900 / Math.max(4, (inside.mark.text ?? '').length * 0.62)))}px">${esc(inside.mark.text ?? '')}</span>`}</div>` : '';
  const body = sheets.map((s, i) => {
    const bands = doc.titlePage && i === 0 ? '' : bandHtml(doc.header, 'head', i + 1, sheets.length) + bandHtml(doc.footer, 'foot', i + 1, sheets.length);
    // Without pages, the footnotes go at the end (after the last sheet's words).
    const end = !paged && notes && i === sheets.length - 1 ? `<div class="nd-endnotes"><div class="nd-notes-wrap">${notes}</div></div>` : '';
    const words = cols && !paged ? `<div class="nd-cols">${s.join('')}</div>` : s.join('');
    return `<div class="nd-sheet">${mode === 'print' ? '' : wm}${bands}${words}${end}</div>`;
  });
  const extra = paged ? `<div class="nd-notes-src" hidden>${notes}</div>` : '';
  const printMark = mode === 'print' && wm ? wm.replace('class="nd-wm"', 'class="nd-wm nd-wm-print"') : '';
  const html = body.join('') + extra;
  const script = paged
    ? `<script data-paginate>Promise.all([document.fonts.ready,...Array.from(document.images).map(function(i){return i.complete?0:new Promise(function(r){i.onload=i.onerror=r})})]).then(function(){(${PAGINATE_SRC})(${JSON.stringify(paginateOptions(doc))})})</script>`
    : '';
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>`,
    '<meta name="generator" content="Hydor documents">',
    fams ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${esc(fams)}&amp;display=swap">` : '',
    docHasMath(inside) ? `<style>${katexStyle(html)}</style>` : '',
    `<style>${pageCss(doc, mode)}\n${docCss(doc)}${suggestionsCss(doc)}${mode === 'viewer' ? `\n@media print{${printCss(doc)}}` : ''}</style></head><body>`,
    `<main class="nd-doc" translate="no">${html}</main>${printMark}`,
    script,
    '</body></html>',
  ].join('\n');
}

/** The page-by-page layout of a printed document (doc-paginate.ts), as the page runs it. */
const PAGINATE_SRC = scriptSafe(paginateDoc.toString());

/** What the editor's Print lays out a document's pages with (its frame runs no script of the page's own). */
export function paginateOptions(doc: Doc) {
  const px = (mm: number) => Math.round(mm * PX_MM * 100) / 100;
  return { w: px(paperOf(doc.page).w - 2 * doc.page.margin), h: px(paperOf(doc.page).h - 2 * doc.page.margin) - 1, cols: doc.page.cols ?? 1, gap: px(COLUMN_GAP), sep: 16 };
}

/** What get_page tells an agent of a document: its outline, then the document as Markdown, and how to change it. */
export function docForAgent(text: string): string {
  const doc = readDoc(text);
  const md = docMarkdown(doc, { comments: true });
  const body =
    md.length > 200_000
      ? `${md.slice(0, 200_000)}\n… (cut here: the document is ${Math.round(md.length / 1024)} KB as Markdown. Sending it back whole would lose what you did not read: tell the user, and change it only if they want the rest rewritten.)`
      : md;
  const paper = PAPERS[doc.page.size].label;
  const bands = [doc.header ? `Header: “${doc.header.text}”${doc.header.align ? ` (${doc.header.align})` : ''}.` : '', doc.footer ? `Footer: “${doc.footer.text}”${doc.footer.align ? ` (${doc.footer.align})` : ''}.` : '', doc.titlePage ? 'The first page is a title page, without them.' : '']
    .filter(Boolean)
    .join(' ');
  const setup = [
    doc.page.orient === 'landscape' ? 'landscape' : '',
    doc.page.cols ? `${doc.page.cols} columns` : '',
    doc.page.color ? `page colour ${doc.page.color}` : '',
    doc.mark ? `a watermark (${doc.mark.text ? `“${doc.mark.text}”` : 'a picture'})` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const styles = Object.entries(doc.styles ?? {})
    .map(([k, x]) => `${k} ${JSON.stringify(x)}`)
    .join('; ');
  return [
    `A document of about ${docWords(doc)} words, ${doc.blocks.length} block${doc.blocks.length === 1 ? '' : 's'} (${paper} paper, ${doc.page.margin} mm margins; ${doc.font} ${doc.size} pt${setup ? `; ${setup}` : ''}).${bands ? ` ${bands}` : ''}${styles ? ` Its paragraph styles' own looks: ${styles}.` : ''}`,
    '',
    'Outline:',
    docOutline(doc),
    '',
    'The document as Markdown. To change it, send it back whole with save_doc and this id (markdown; page, font, size, header and footer only to change them), or make small changes with edits (find and replace, a section, after or before a heading, append). Keep what you do not mean to change as it is: the attributes in braces ({.title}, {.center}, {line=1.5}…), <u>, <span style>, ==highlights==, $maths$, the comments’ <span data-comment> marks, the suggested changes’ marks (<ins data-s>, <del data-s>, <span data-s data-was>, {ins=…} and {del=…}), and the pictures’ naget-asset: sources.',
    '',
    body,
    ...sourcesForAgent(doc),
    ...commentsForAgent(doc),
    ...suggestionsForAgent(doc),
  ].join('\n');
}

/** The sources a document has, after it: each by its key, to cite as [@key]. */
function sourcesForAgent(doc: Doc): string[] {
  if (!doc.sources?.length) return [];
  return [
    '',
    `Sources (${doc.sources.length}; citations in ${CITE_STYLE_NAMES[doc.cite ?? 'apa']} style), each cited as [@key] (several: [@a; @b, p. 4]); [BIBLIOGRAPHY] lists those cited:`,
    ...doc.sources.map((x) => `- ${x.id}: ${sourceLine(x)}${x.in ? ` · ${x.in}` : ''}${x.doi ? ` · doi:${x.doi}` : ''}`),
  ];
}

const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace('T', ' ');

/** The suggested changes, after the comments: what each does, who made it, its replies, and how to answer them. */
function suggestionsForAgent(doc: Doc): string[] {
  const list = doc.suggestions ?? [];
  if (!list.length) return [];
  const by = new Map(list.map((x) => [x.id, x]));
  const who = (x: Parameters<typeof authorForAgent>[0]) => authorForAgent(x);
  const q = (t: string) => `“${t.replace(/\n/g, ' / ').slice(0, 200)}”`;
  const lines = changesOf(doc).flatMap((c) => {
    const x = by.get(c.id);
    if (!x) return [];
    const what = [
      c.removed ? `take out ${q(c.removed)}` : '',
      c.added ? `add ${q(c.added)}` : '',
      c.looks.length ? `change the look (${c.looks.join(', ')})` : '',
      c.paras.added ? `add ${c.paras.added > 1 ? `${c.paras.added} paragraphs` : 'a paragraph'}` : '',
      c.paras.removed ? `take out ${c.paras.removed > 1 ? `${c.paras.removed} paragraphs` : 'a paragraph'}` : '',
      c.breaks.added ? `break a paragraph in two${c.breaks.added > 1 ? ` (${c.breaks.added})` : ''}` : '',
      c.breaks.removed ? `join a paragraph to the one before${c.breaks.removed > 1 ? ` (${c.breaks.removed})` : ''}` : '',
      ...c.blocks.added.map((k) => `add a block (${k})`),
      ...c.blocks.removed.map((k) => `take out a block (${k})`),
    ].filter(Boolean);
    return [`- ${c.id} · ${who(x)}, ${when(x.at)} UTC: ${what.join('; ')}`, ...(x.replies ?? []).map((r) => `    ↳ ${who(r)}, ${when(r.at)} UTC: ${r.text.replace(/\n/g, ' / ')}`)];
  });
  return [
    '',
    `Suggested changes (${lines.filter((l) => l.startsWith('-')).length}), each marked above with its id (words to add <ins data-s="id">, to take out <del data-s="id">, a new look <span data-s="id" data-was="…">, a paragraph's new or removed break {ins=id} or {del=id}):`,
    ...lines,
    '',
    'To answer them, save_doc with this id and suggestions: [{"id": "<id>", "accept": true}] (makes the change), {"id": "<id>", "reject": true} (undoes it) or {"id": "<id>", "reply": "…"}; keep the marks of those you leave. To suggest changes yourself instead of making them, send the document as you would have it with "suggest": true: each difference becomes a suggestion of yours for the user to accept or reject.',
  ];
}

/** The comments' threads, after the document, and how to answer them. */
function commentsForAgent(doc: Doc): string[] {
  const list = doc.comments ?? [];
  if (!list.length) return [];
  const open = list.filter((c) => !c.resolved).length;
  return [
    '',
    `Comments (${open} open, ${list.length - open} resolved), each on the words marked with its id above:`,
    ...list.flatMap((c) => [
      `- ${c.id} · ${c.resolved ? 'resolved' : 'open'}${c.quote ? ` · on “${c.quote.slice(0, 160)}”` : ''} · ${authorForAgent(c)}, ${when(c.at)} UTC: ${c.text.replace(/\n/g, ' / ')}`,
      ...(c.replies ?? []).map((r) => `    ↳ ${authorForAgent(r)}, ${when(r.at)} UTC: ${r.text.replace(/\n/g, ' / ')}`),
    ]),
    '',
    'To answer them, save_doc with this id and comments: [{"id": "<id>", "reply": "what you did or say"}], adding "resolve": true once a comment is dealt with (or "reopen": true). Make the change a comment asks for in the markdown too. Add a comment of your own with <span data-comment="new1">the words</span> in the markdown and {"id": "new1", "text": "…"} in comments.',
    ...(peopleNote(list) ? [peopleNote(list)!] : []),
  ];
}

// ---- Word ---------------------------------------------------------------------------------------------------------

const JC: Record<string, 'center' | 'right' | 'justify' | undefined> = { center: 'center', right: 'right', justify: 'justify' };
const PX_PER_TEXT = (doc: Doc) => (PAPERS[doc.page.size].w - 2 * doc.page.margin) * PX_MM;

/** A suggestion's tracked change for Word: what it is, who made it (by name), when. */
const revOf = (sgs: Map<string, Suggestion>, id: string | undefined, kind: 'ins' | 'del'): DocRev | undefined => {
  const x = id ? sgs.get(id) : undefined;
  return x ? { kind, author: authorOf(x.by, x.author).name, at: x.at } : undefined;
};

/** What a document's Word file needs to say of its marks: what each shows, and the bookmark each place it points to has. */
interface WordRefs {
  refs: Refs;
  /** A block's bookmark in the file (a bookmark of the document's by its name, else one Word hides). */
  mark: (id: string) => string;
}

const wordRun = (r: Run, sgs: Map<string, Suggestion> = new Map(), wr?: WordRefs): WordRun => {
  // A footnote's mark (its number), a citation (Word's own) and a cross-reference (a REF field), showing what they show here.
  if (wr && (r.fn || r.cite || r.xref)) {
    const w: WordRun = r.fn ? { t: '', fn: wr.refs.note(r.t) || 1 } : r.cite ? { t: wr.refs.text(r), cite: citeItems(r.t) } : { t: wr.refs.text(r), fld: `REF ${wr.mark(r.t)} \\h` };
    if (r.cm) w.cm = r.cm;
    const rev = revOf(sgs, r.del, 'del') ?? revOf(sgs, r.ins, 'ins');
    if (rev) w.rev = rev;
    return w;
  }
  const w: WordRun = { t: r.t };
  for (const k of ['b', 'i', 'u', 's', 'code', 'sup', 'sub', 'math'] as const) if (r[k]) w[k] = true;
  if (r.color) w.color = r.color;
  if (r.hl) w.hl = r.hl;
  if (r.size) w.size = r.size;
  if (r.font) w.font = r.font;
  if (r.link) w.link = r.link.startsWith('#') ? (wr ? `#${wr.mark(r.link.slice(1))}` : undefined) : r.link;
  if (!w.link) delete w.link;
  if (r.cm) w.cm = r.cm;
  // Its suggested change, as a tracked change (words taken out over words added: those are Word's deleted text).
  const rev = revOf(sgs, r.del, 'del') ?? revOf(sgs, r.ins, 'ins');
  if (rev) w.rev = rev;
  const f = r.fmt ? sgs.get(r.fmt) : undefined;
  if (f) w.fmtRev = { author: authorOf(f.by, f.author).name, at: f.at, was: { ...(r.was ?? {}) } };
  return w;
};

/** A table's rows for Word: a cell merged across columns spans them, one merged down starts a run of cells Word joins. */
function wordRows(t: TableBlock, sgs: Map<string, Suggestion>, wr?: WordRefs): { cells: DocCell[] }[] {
  const under = fixMerges(t.rows.map((r) => r.map((c) => ({ ...c }))));
  return t.rows.map((r, ri) => {
    const cells: DocCell[] = [];
    r.forEach((c, ci) => {
      const u = under[ri][ci];
      if (u) {
        // Under a cell merged down: one cell in its place, joined to it, as wide as it.
        if (u[0] < ri && u[1] === ci) {
          const top = t.rows[u[0]][u[1]];
          cells.push({ runs: [], vm: 'cont', ...(top.cs ? { span: top.cs } : {}), ...(top.fill ? { fill: top.fill } : {}), ...(t.head && ri === 0 ? { head: true } : {}) });
        }
        return;
      }
      const cell: DocCell = { runs: c.runs.map((r) => wordRun(r, sgs, wr)) };
      if (t.head && ri === 0) cell.head = true;
      if (c.align && JC[c.align]) cell.align = JC[c.align];
      if (c.fill) cell.fill = c.fill;
      if (c.va) cell.va = c.va === 'middle' ? 'center' : 'bottom';
      if (c.cs) cell.span = c.cs;
      if (c.rs) cell.vm = 'restart';
      cells.push(cell);
    });
    return { cells };
  });
}

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

/** Whether words are Chinese, Japanese or Korean. */
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

/** The faces of fonts a document's Word file uses: its font's, its words' own, and its code's, each bold or italic as they are shown. */
export function docFaces(doc: Doc): FontFace[] {
  const out = new Map<string, FontFace>();
  const add = (name: string, b: boolean, i: boolean) => out.set(`${name}|${b}|${i}`, { name, b, i });
  add(doc.font, false, false);
  const words = (runs: Run[], b: boolean, i: boolean) => {
    for (const r of runs) if (!r.math) add(r.code ? MONO_DOC : (r.font ?? doc.font), b || !!r.b, i || !!r.i);
  };
  for (const blk of doc.blocks) {
    if (blk.type === 'p') {
      const st = blk.style ?? 'normal';
      if (st === 'code') add(MONO_DOC, false, false);
      else words(blk.runs, !!styleOf(doc, st).bold, !!styleOf(doc, st).italic);
      if (st !== 'code' && st !== 'normal' && styleOf(doc, st).font) add(styleOf(doc, st).font!, !!styleOf(doc, st).bold, !!styleOf(doc, st).italic);
    } else if (blk.type === 'li') words(blk.runs, false, false);
    else if (blk.type === 'table') blk.rows.forEach((r, ri) => r.forEach((c) => words(c.runs, !!blk.head && ri === 0, false)));
    else if (blk.type === 'toc' && tocEntries(doc).some((e) => e.level === 1)) add(doc.font, true, false);
  }
  return [...out.values()];
}

/**
 * Word's spacing for each of a document's blocks, as the editor lays them out (word-layout.ts): space before and after
 * in points, and lines in points (at least, or exactly) or, where lines must grow with what they hold, as a multiple
 * of Word's line; `sep`, for a table right after another, the gap between them.
 */
export function wordSpaces(doc: Doc, blocks: Block[] = doc.blocks): (DocSpace & { sep?: number })[] {
  const places = wordPlaces(doc, blocks);
  return blocks.map((b, i) => {
    const p = places[i];
    const sp: DocSpace & { sep?: number } = { before: p.before, after: p.after };
    if (p.sep !== undefined) sp.sep = p.sep;
    if (b.type === 'p' || b.type === 'li') {
      const code = b.type === 'p' && b.style === 'code';
      const font = code ? MONO_DOC : doc.font;
      const l = wordLineOf(p.box.line, ownLine(b.runs, font, MONO_DOC, p.box.size), !code && grows(b.runs, p.box.size), wordLine(font) * p.box.size);
      sp.line = l.line;
      if (l.rule) sp.rule = l.rule;
    } else if (b.type === 'math') sp.line = 1;
    return sp;
  });
}

/**
 * The document as a Word file, laid out as the editor lays it out (its pages break where the editor's do, as near as
 * Word allows): its paper and margins, font and sizes, headings, lists (checklists with boxes Word ticks), tables,
 * pictures (from the kept ones, or `picture`: made ready for Office, an SVG drawn as PNG), page breaks, and the faces
 * of its fonts (`fonts`, wordFonts of docFaces) inside it.
 */
export function docxOfDoc(db: DB, doc: Doc, title: string, picture?: (src: string) => Picture | null, fonts?: Map<string, EmbeddedFont>): Buffer {
  const { groups } = listInfo(doc.blocks);
  // Footnotes' numbers, citations' and cross-references' words, numbered captions, the bibliography; and the places
  // the document points to (cross-references, links to a place in it) and its own bookmarks, each a bookmark.
  const refs = docRefs(doc);
  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const b of doc.blocks) {
    if ((b.type !== 'p' && b.type !== 'li') || !b.bm) continue;
    let n = b.bm.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^[^\p{L}]+/u, '').slice(0, 40) || 'Bookmark';
    for (let k = 2; used.has(n.toLowerCase()); k++) n = `${n.slice(0, 36)}_${k}`;
    used.add(n.toLowerCase());
    names.set(b.id, n);
  }
  const wr: WordRefs = { refs, mark: (id) => names.get(id) ?? bookmarkName(id) };
  const targets = new Set<string>([...names.keys()]);
  const take = (runs: Run[]) => {
    for (const r of runs) {
      if (r.xref) targets.add(r.t);
      if (r.link?.startsWith('#')) targets.add(r.link.slice(1));
    }
  };
  for (const b of doc.blocks) {
    if (b.type === 'p' || b.type === 'li') take(b.runs);
    else if (b.type === 'table') for (const row of b.rows) for (const c of row) take(c.runs);
  }
  for (const n of doc.notes ?? []) take(n.runs);
  /** A block's bookmark, where something points to it. */
  const bmOf = (id: string) => (targets.has(id) ? { bm: wr.mark(id) } : {});
  /** A numbered caption's label and number. */
  const numOf = (b: { id: string; label?: string }) => {
    const n = b.label ? Number(/\d+$/.exec(refs.label(b.id) ?? '')?.[0]) : 0;
    return n ? { label: b.label!, num: n } : {};
  };
  const blocks: WordBlock[] = [];
  const pictures: Buffer[] = [];
  const spaces = wordSpaces(doc);
  // The headings a table of contents lists, each with a bookmark its line leads to.
  const toc = doc.blocks.some((b) => b.type === 'toc') ? tocEntries(doc) : [];
  const anchors = new Map(toc.map((e, k) => [e.id, `_Toc${k + 1}`]));
  // Suggested changes as tracked changes: a paragraph's new (or removed) break is the paragraph before's mark.
  const sgs = new Map((doc.suggestions ?? []).map((x) => [x.id, x]));
  let lastPara = -1;
  let cjk = false;
  doc.blocks.forEach((b, i) => {
    if (b.type === 'p' || b.type === 'li') {
      const mark = revOf(sgs, b.del, 'del') ?? revOf(sgs, b.ins, 'ins');
      const prev = blocks[lastPara];
      if (mark && prev && (prev.k === 'p' || prev.k === 'h' || prev.k === 'li')) prev.mark = mark;
    }
    if (!cjk && CJK.test(blockText(b))) cjk = true;
    const pushed = blocks.length;
    blockOf(b, i);
    if ((b.type === 'p' || b.type === 'li') && blocks.length > pushed && ['p', 'h', 'li'].includes(blocks[blocks.length - 1].k)) lastPara = blocks.length - 1;
  });
  function blockOf(b: (typeof doc.blocks)[number], i: number) {
    const { sep, ...space } = spaces[i];
    if (b.type === 'p') {
      const runs = b.runs.map((r) => wordRun(r, sgs, wr));
      const align = b.align ? JC[b.align] : undefined;
      const style = b.style ?? 'normal';
      const lvl = headingLevel(style);
      if (lvl) blocks.push({ k: 'h', lvl: lvl as 1 | 2 | 3 | 4, runs, keep: true, space, ...(align ? { align } : {}), ...(anchors.has(b.id) ? { anchor: anchors.get(b.id) } : {}), ...bmOf(b.id) });
      else if (style === 'code') blocks.push({ k: 'pre', text: b.runs.map((r) => r.t).join('') || ' ', space });
      else
        blocks.push({
          k: 'p',
          runs,
          keep: true,
          space,
          ...(align ? { align } : {}),
          ...(style === 'quote' ? { quote: true } : {}),
          ...(style === 'title' || style === 'subtitle' ? { style } : {}),
          ...(style === 'callout' ? { shade: b.tint ?? CALLOUT.tint, icon: b.icon ?? CALLOUT.icon } : {}),
          ...(b.lvl ? { indent: b.lvl } : {}),
          ...bmOf(b.id),
        });
    } else if (b.type === 'li') {
      const align = b.align ? JC[b.align] : undefined;
      blocks.push({
        k: 'li',
        ordered: b.list === 'number',
        lvl: b.lvl ?? 0,
        list: groups[i],
        runs: b.runs.map((r) => wordRun(r, sgs, wr)),
        keep: true,
        space,
        ...(b.list === 'check' ? { check: true, ...(b.checked ? { checked: true } : {}) } : {}),
        ...(align ? { align } : {}),
        ...bmOf(b.id),
      });
    } else if (b.type === 'table') {
      const rev = revOf(sgs, b.del, 'del') ?? revOf(sgs, b.ins, 'ins');
      blocks.push({ k: 'table', rows: wordRows(b, sgs, wr), ...(b.cols ? { cols: b.cols } : {}), ...(rev ? { rev } : {}), ...(sep !== undefined ? { sep } : {}), ...(b.caption ? { caption: b.caption } : {}), ...numOf(b), ...bmOf(b.id) });
    } else if (b.type === 'toc') {
      blocks.push({ k: 'toc', entries: toc.map((e) => ({ lvl: e.level, text: e.text, anchor: anchors.get(e.id)! })), space });
    } else if (b.type === 'math') {
      blocks.push({ k: 'math', tex: b.tex, space, ...numOf(b), ...bmOf(b.id) });
    } else if (b.type === 'bib') {
      blocks.push({ k: 'bib', entries: refs.bib().map((e) => e.map((r) => wordRun(r))), space });
    } else if (b.type === 'image') {
      const pic = picture?.(b.src) ?? keptPicture(db, b.src);
      if (!pic || pic.ext === 'webp') {
        if (b.alt || b.caption) blocks.push({ k: 'p', runs: [{ t: b.caption || b.alt || '', i: true }], space });
        return;
      }
      const w = Math.max(16, Math.round(PX_PER_TEXT(doc) * b.w));
      pictures.push(pic.data);
      const rev = revOf(sgs, b.del, 'del') ?? revOf(sgs, b.ins, 'ins');
      blocks.push({ k: 'img', shot: pictures.length - 1, w, h: Math.round((w * pic.h) / Math.max(1, pic.w)), share: b.w, align: b.align ?? 'center', space, ...(b.alt ? { alt: b.alt } : {}), ...(b.caption ? { caption: b.caption } : {}), ...(rev ? { rev } : {}), ...numOf(b), ...bmOf(b.id) });
    } else if (b.type === 'hr') blocks.push({ k: 'hr', space });
    else blocks.push({ k: 'pb' });
  }
  const look: DocLook = {
    font: doc.font,
    size: doc.size,
    title: Math.round(doc.size * styleOf(doc, 'title').k * 2) / 2,
    subtitle: Math.round(doc.size * styleOf(doc, 'subtitle').k * 2) / 2,
    heads: (['h1', 'h2', 'h3', 'h4', 'h4', 'h4'] as ParaStyle[]).map((s) => Math.round(doc.size * styleOf(doc, s).k * 2) / 2),
    ...(doc.styles ? { styles: doc.styles } : {}),
    editor: { cjk },
  };
  return docxFile({ title, lang: '', blocks, shots: pictures.map(() => ({ x: 0, y: 0, w: 1, h: 1 })) }, pictures, {
    title,
    paper: doc.page.size,
    margin: doc.page.margin,
    look,
    titled: false,
    header: doc.header,
    footer: doc.footer,
    titlePage: doc.titlePage,
    // Someone the project is shared with goes into the file by their name, as other people's comments do.
    comments: doc.comments?.map((c) => ({ id: c.id, by: c.by === 'person' ? 'user' : c.by, author: c.by === 'person' ? c.name : c.author, text: c.text, at: c.at, resolved: c.resolved, replies: c.replies?.map((r) => ({ by: r.by === 'person' ? 'user' : r.by, author: r.by === 'person' ? r.name : r.author, text: r.text, at: r.at })) })),
    fonts,
    // Footnotes by their numbers; the sources citations cite; the page set up.
    notes: (doc.notes ?? []).flatMap((n) => (refs.note(n.id) ? [{ n: refs.note(n.id), runs: n.runs.map((r) => wordRun(r, sgs, wr)) }] : [])).sort((a, b) => a.n - b.n),
    ...(doc.sources?.length ? { sources: doc.sources, cite: doc.cite ?? 'apa' } : {}),
    ...(doc.page.orient === 'landscape' ? { landscape: true } : {}),
    ...(doc.page.cols ? { cols: doc.page.cols } : {}),
    ...(doc.page.color ? { color: doc.page.color } : {}),
    ...(doc.mark ? { watermark: doc.mark.src ? { picture: markPicture(db, doc.mark.src, picture) } : { text: doc.mark.text } } : {}),
  });
}

/** A watermark's picture for Word (PNG or JPEG), or none. */
function markPicture(db: DB, src: string, picture?: (src: string) => Picture | null): { data: Buffer; ext: string; w: number; h: number } | undefined {
  const p = picture?.(src) ?? keptPicture(db, src);
  return p && (p.ext === 'png' || p.ext === 'jpeg') ? { data: p.data, ext: p.ext, w: p.w, h: p.h } : undefined;
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
  /** The comments whose words are being read (Word's ids), and each one's id here (a reply's: its thread's). */
  openCm: Set<string>;
  cmIds: Map<string, string>;
  /** Inside a table of contents Word keeps as a field: how deep in fields, while its lines are skipped. */
  toc: number;
  /** Tracked changes read as suggestions: the one being read (inserted or deleted words), the suggestions made, the last one (to go on with it while nothing unchanged came between), and a paragraph's mark for the next paragraph's break. */
  rev: { kind: 'ins' | 'del'; id: string } | null;
  sugs: Suggestion[];
  lastRev: { key: string; id: string } | null;
  plainSince: boolean;
  nextBreak: { kind: 'ins' | 'del'; id: string } | null;
  /** Footnotes' and endnotes' words, by their ids here (f1, e1). */
  notes: Map<string, Run[]>;
  /** The bookmarks started in the paragraph being read, and each bookmark's block (by the id given to it). */
  marksHere: string[];
  marks: Map<string, string>;
  /** The picture a caption just read belongs to (its bookmarks lead to the picture). */
  capTarget?: Record<string, unknown>;
}

/** A tracked change's suggestion: the one of its author and time just before it, while nothing unchanged came between; else a new one. */
function revSuggestion(ctx: WCtx, el: El): string {
  const author = att(el, 'author') ?? '';
  const date = att(el, 'date') ?? '';
  const key = `${author}|${date}`;
  if (ctx.lastRev && ctx.lastRev.key === key && !ctx.plainSince) return ctx.lastRev.id;
  const id = `t${ctx.sugs.length + 1}`;
  const name = cleanAuthor(author);
  ctx.sugs.push({ id, by: /^agent$/i.test(author) ? 'agent' : 'user', ...(name ? { author: name } : {}), at: Date.parse(date) || Date.now() });
  ctx.lastRev = { key, id };
  ctx.plainSince = false;
  return id;
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
    // A monospaced font marks code, but one the app offers (JetBrains Mono, Courier New) is the words' font.
    if (MONO_FONTS.test(font) && !FONTS.some((f) => f.name.toLowerCase() === font.toLowerCase())) into.code = true;
    else into.font = font;
  }
}

/** What a paragraph is: its style (a heading, the title…), list, alignment and indent. */
function pKind(ctx: WCtx, pPr: El | undefined): { style: ParaStyle; list?: { kind: 'bullet' | 'number' | 'check'; lvl: number }; align?: Align; lvl: number; left: number; hanging: number; caption: boolean } {
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
  const left = Number(att(kid(pPr, 'ind'), 'left') ?? att(kid(pPr, 'ind'), 'start') ?? 0) || 0;
  const hanging = Number(att(kid(pPr, 'ind'), 'hanging') ?? 0) || 0;
  return { style, list, align, lvl: list ? 0 : Math.min(4, Math.max(0, Math.round(left / 720))), left, hanging, caption };
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
    // Word puts a picture whose paragraph says nothing on the left (this app's files say each one's).
    ...(!align || align === 'left' || align === 'right' ? { align: align ?? 'left' } : {}),
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
  /** A field being read: its instruction so far, whether its result is being read, and where its result's runs start. */
  field?: { instr: string; result: boolean; link?: string; at?: number };
  /** A caption's SEQ field's label ("Figure"). */
  seq?: string;
}

/** The comments on the words being read, by their ids here. */
function openComments(ctx: WCtx): string[] | undefined {
  const ids = [...new Set([...ctx.openCm].flatMap((w) => (ctx.cmIds.has(w) ? [ctx.cmIds.get(w)!] : [])))];
  return ids.length ? ids : undefined;
}

function runContent(ctx: WCtx, r: El, look: Look, c: PCollect, align: Align | undefined) {
  const add = (t: string) => {
    if (!t) return;
    const link = c.field?.result ? (c.field.link ?? c.link) : c.link;
    const cm = openComments(ctx);
    // Inside a tracked change, words added or taken out; else words that stay (what goes on with a change ends here).
    if (ctx.rev) c.runs.push({ t, ...look, ...(link ? { link } : {}), ...(cm ? { cm } : {}), [ctx.rev.kind]: ctx.rev.id });
    else {
      ctx.plainSince = true;
      c.runs.push({ t, ...look, ...(link ? { link } : {}), ...(cm ? { cm } : {}) });
    }
  };
  for (const x of r.c) {
    if (!isEl(x)) continue;
    switch (x.n) {
      case 't':
      case 'delText':
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
      case 'footnoteReference':
      case 'endnoteReference': {
        // A footnote's mark: its words are the file's notes (read already).
        const id = `${x.n === 'footnoteReference' ? 'f' : 'e'}${(att(x, 'id') ?? '').replace(/[^A-Za-z0-9_-]/g, '')}`;
        if (ctx.notes.has(id)) c.runs.push({ t: id, fn: true });
        break;
      }
      case 'instrText':
        if (c.field && !c.field.result) c.field.instr += x.c.map((y) => (typeof y === 'string' ? y : '')).join('');
        break;
      case 'fldChar': {
        const t = att(x, 'fldCharType');
        if (t === 'begin') c.field = { instr: '', result: false };
        else if (t === 'separate' && c.field) {
          c.field.result = true;
          c.field.at = c.runs.length;
          const m = /HYPERLINK\s+"([^"]+)"/.exec(c.field.instr);
          c.field.link = m ? docLink(m[1]) : undefined;
          const seq = /^\s*SEQ\s+(\S+)/i.exec(c.field.instr);
          if (seq) c.seq = seq[1].replace(/_/g, ' ');
        } else if (t === 'end') {
          if (c.field) fieldDone(c, c.field.instr, c.field.at ?? c.runs.length);
          c.field = undefined;
        }
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

/**
 * A field's result read: a citation (CITATION) becomes one of the document's, its sources by their tags; a cross-reference
 * (REF to a bookmark) waits for its bookmark's block (refsAfter); others stay as the words they showed.
 */
function fieldDone(c: PCollect, instr: string, at: number) {
  const cite = citationOf(instr);
  if (cite.length) {
    c.runs.splice(at, c.runs.length - at, { t: citeOf(cite), cite: true } as Run);
    return;
  }
  const ref = /^\s*(?:REF|PAGEREF)\s+([A-Za-z0-9_]{1,40})/i.exec(instr);
  if (ref && /^\s*REF/i.test(instr) && c.runs.length > at) {
    const words = c.runs.slice(at).map((r) => r.t).join('');
    // A thing of its own while it waits (so it joins no words beside it).
    c.runs.splice(at, c.runs.length - at, { t: words, xref: true, ref: ref[1] } as Run & { ref: string });
  }
}

function inline(ctx: WCtx, el: El, c: PCollect, align: Align | undefined) {
  for (const x of el.c) {
    if (!isEl(x)) continue;
    switch (x.n) {
      case 'r': {
        const rPr = kid(x, 'rPr');
        const look: Look = {};
        // Its character style's look, then its own. Code's look (its font, size, shading) is code's, a link's (blue,
        // underlined) the link's, and a ticked checklist item's (struck, grey) the item's: not the words' own.
        for (const s of chain(ctx, att(kid(rPr, 'rStyle'), 'val')).reverse()) {
          if (/code/i.test(s.name)) look.code = true;
          else if (s.name !== 'Done item' && !/^(hyperlink|followedhyperlink)$/i.test(s.name.replace(/\s+/g, ''))) rLook(ctx, s.rPr, look);
        }
        rLook(ctx, rPr, look);
        if (look.size === ctx.size) delete look.size;
        if (look.font && look.font.toLowerCase() === ctx.font.toLowerCase()) delete look.font;
        // A tracked change of its formatting: a new look suggested, the one in the change its old one.
        const chg = kid(rPr, 'rPrChange');
        if (chg) {
          const was: Look = {};
          rLook(ctx, kid(chg, 'rPr'), was);
          if (was.size === ctx.size) delete was.size;
          look.fmt = revSuggestion(ctx, chg);
          look.was = was;
        }
        runContent(ctx, x, look, c, align);
        break;
      }
      case 'hyperlink': {
        const rel = ctx.rels.get(patt(x, 'id') ?? '');
        const was = c.link;
        // A link to a place in the file (a bookmark): a place in the document, once the bookmark's block is known.
        const anchor = att(x, 'anchor');
        c.link = (rel?.external ? docLink(rel.target) : anchor && /^[A-Za-z0-9_]{1,40}$/.test(anchor) ? `#~${anchor}` : undefined) ?? was;
        inline(ctx, x, c, align);
        c.link = was;
        break;
      }
      case 'fldSimple': {
        const was = c.link;
        const instr = att(x, 'instr') ?? '';
        const m = /HYPERLINK\s+"([^"]+)"/.exec(instr);
        if (m) c.link = docLink(m[1]) ?? was;
        const seq = /^\s*SEQ\s+(\S+)/i.exec(instr);
        if (seq) c.seq = seq[1].replace(/_/g, ' ');
        const at = c.runs.length;
        inline(ctx, x, c, align);
        fieldDone(c, instr, at);
        c.link = was;
        break;
      }
      case 'bookmarkStart': {
        const name = att(x, 'name') ?? '';
        if (name && name !== '_GoBack') ctx.marksHere.push(name);
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
      case 'del':
      case 'moveFrom': {
        // Tracked changes: words inserted (or moved here) are words to add; deleted (or moved away), words to take out.
        const was = ctx.rev;
        ctx.rev = { kind: x.n === 'ins' || x.n === 'moveTo' ? 'ins' : 'del', id: revSuggestion(ctx, x) };
        inline(ctx, x, c, align);
        ctx.rev = was;
        break;
      }
      case 'smartTag':
      case 'customXml':
      case 'sdtContent':
      case 'dir':
      case 'bdo':
        inline(ctx, x, c, align);
        break;
      case 'commentRangeStart':
        ctx.openCm.add(att(x, 'id') ?? '');
        break;
      case 'commentRangeEnd':
        ctx.openCm.delete(att(x, 'id') ?? '');
        break;
      case 'oMath':
      case 'oMathPara': {
        // Word's equations among the words: their LaTeX.
        const tex = texOfOmml(x);
        const cm = openComments(ctx);
        if (tex) c.runs.push({ t: tex, math: true, ...(cm ? { cm } : {}) });
        break;
      }
      case 'AlternateContent': {
        const ch = kid(x, 'Choice') ?? kid(x, 'Fallback');
        if (ch) inline(ctx, ch, c, align);
        break;
      }
    }
  }
}

/** How deep in fields a paragraph leaves Word's reader (fields it opens, less those it closes). */
const fieldDepth = (p: El) => all(p, 'fldChar').reduce((n, f) => n + (att(f, 'fldCharType') === 'begin' ? 1 : att(f, 'fldCharType') === 'end' ? -1 : 0), 0);

/** A paragraph's own spacing as Word says it (points before and after; lines in points with their rule, or as a multiple), kept on its block until ownSpacing decides what of it is the paragraph's own. */
type RawSpace = { before?: number; after?: number; line?: number; rule?: 'atLeast' | 'exact' };
const RAW = '__space';

function wordSpacing(pPr: El | undefined): RawSpace | undefined {
  const sp = kid(pPr, 'spacing');
  if (!sp) return undefined;
  const out: RawSpace = {};
  const before = att(sp, 'before');
  const after = att(sp, 'after');
  const line = att(sp, 'line');
  const rule = att(sp, 'lineRule') ?? 'auto';
  if (before !== undefined && /^\d+$/.test(before) && att(sp, 'beforeAutospacing') !== '1') out.before = Math.min(400, Number(before) / 20);
  if (after !== undefined && /^\d+$/.test(after) && att(sp, 'afterAutospacing') !== '1') out.after = Math.min(400, Number(after) / 20);
  if (line !== undefined && /^\d+$/.test(line) && Number(line) > 0) {
    if (rule === 'auto') out.line = Number(line) / 240;
    else if (rule === 'exact' || rule === 'atLeast') {
      out.line = Number(line) / 20;
      out.rule = rule;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A Word file's paragraphs' own spacing, as a document keeps it: what Word says of a paragraph beyond what the
 * editor's layout gives it there anyway (word-layout.ts, the same that writes a document's files, so one written here
 * comes back as it was). Lines come back as the document's lines (1 is the editor's single line): Word's in points as
 * they are, and a multiple of Word's own line by the font's Word line.
 */
function ownSpacing(out: Record<string, unknown>[], font: string, size: number) {
  const doc = { v: 1, page: { size: 'a4', margin: 25.4 }, font, size, blocks: [] } as Doc;
  out.forEach((b, i) => {
    const sp = b[RAW] as RawSpace | undefined;
    delete b[RAW];
    if (!sp || (b.type !== 'p' && b.type !== 'li')) return;
    const win = (i === 0 ? [b, out[i + 1]] : [out[i - 1], b, out[i + 1]]).filter(Boolean) as unknown as Block[];
    const at = i === 0 ? 0 : 1;
    const p = wordPlaces(doc, win)[at];
    const near = (a: number, x: number) => Math.abs(a - x) < 0.06;
    const pt = (x: number) => Math.min(200, Math.round(x * 2) / 2);
    if (sp.after !== undefined && !near(sp.after, p.after)) b.sa = pt(sp.after - p.box.pb);
    if (sp.before !== undefined && !near(sp.before, p.before)) b.sb = pt(sp.before - p.box.pt);
    if (sp.line !== undefined) {
      const h = sp.rule ? sp.line : sp.line * wordLine(b.type === 'p' && b.style === 'code' ? MONO_DOC : font) * p.box.size;
      if (Math.abs(h - p.box.line) > 0.3) b.lh = Math.min(5, Math.max(0.5, Math.round((h / (1.15 * p.box.size)) * 100) / 100));
    }
  });
}

function wordParagraph(ctx: WCtx, p: El, out: Record<string, unknown>[], depth: number) {
  const pPr = kid(p, 'pPr');
  // The paragraph before's mark inserted or deleted: this one's break is that suggestion; this one's own, the next's.
  const start = out.length;
  const breakHere = ctx.nextBreak;
  ctx.nextBreak = null;
  ctx.marksHere = [];
  wordParagraphBody(ctx, p, pPr, out, depth);
  const first = out[start];
  // Its bookmarks lead to its block (a caption's, to its picture's).
  const target = first ?? (ctx.capTarget ? ctx.capTarget : undefined);
  ctx.capTarget = undefined;
  if (target && ctx.marksHere.length) markBlock(ctx, target, ctx.marksHere);
  if (breakHere && first && (first.type === 'p' || first.type === 'li')) first[breakHere.kind] = breakHere.id;
  // Read after its words, so the next paragraph's words of the same change go on with it (a new paragraph is one suggestion).
  const markEl = kid(kid(pPr, 'rPr'), 'ins') ?? kid(kid(pPr, 'rPr'), 'del') ?? kid(kid(pPr, 'rPr'), 'moveTo') ?? kid(kid(pPr, 'rPr'), 'moveFrom');
  if (markEl && depth === 0) ctx.nextBreak = { kind: markEl.n === 'ins' || markEl.n === 'moveTo' ? 'ins' : 'del', id: revSuggestion(ctx, markEl) };
}

function wordParagraphBody(ctx: WCtx, p: El, pPr: El | undefined, out: Record<string, unknown>[], depth: number) {
  // A table of contents Word keeps as a field: one of ours in its place, its lines (Word's last filling in) left out.
  if (ctx.toc > 0) {
    ctx.toc = Math.max(0, ctx.toc + fieldDepth(p));
    return;
  }
  if (all(p, 'instrText').some((t) => /^\s*TOC\b/.test(t.c.map((y) => (typeof y === 'string' ? y : '')).join('')))) {
    out.push({ type: 'toc' });
    ctx.toc = Math.max(0, fieldDepth(p));
    return;
  }
  // A bibliography Word keeps as a field: one of ours in its place (drawn from the sources cited), its entries left out.
  if (all(p, 'instrText').some((t) => /^\s*BIBLIOGRAPHY\b/.test(t.c.map((y) => (typeof y === 'string' ? y : '')).join('')))) {
    out.push({ type: 'bib' });
    ctx.toc = Math.max(0, fieldDepth(p));
    return;
  }
  const k = pKind(ctx, pPr);
  if (kid(pPr, 'pageBreakBefore') && on(kid(pPr, 'pageBreakBefore')) && out.length) out.push({ type: 'pagebreak' });
  // An equation on a line of its own.
  const mathPara = kid(p, 'oMathPara');
  if (mathPara && !kids(p, 'r').some((r) => all(r, 't').some((t) => t.c.some((y) => typeof y === 'string' && y.trim())))) {
    const tex = texOfOmml(mathPara);
    if (tex) out.push({ type: 'math', tex });
    return;
  }
  const c: PCollect = { runs: [], after: [], breaks: [] };
  inline(ctx, p, c, k.align);
  let runs = mergeRuns(c.runs);
  // A box Word ticks, then the tab to the item's words.
  if (c.check && /^[\t ]/.test(runs[0]?.t ?? '')) runs = mergeRuns([{ ...runs[0], t: runs[0].t.replace(/^[\t ]+/, '') }, ...runs.slice(1)].filter((r) => r.t));
  // A box drawn as a character starts a checklist's item.
  const glyph = /^\s*([☐☑☒])\s*/.exec(runs[0]?.t ?? '');
  if (glyph && (k.list || runs.length)) {
    c.check = true;
    c.checked = glyph[1] !== '☐';
    runs = mergeRuns([{ ...runs[0], t: runs[0].t.slice(glyph[0].length) }, ...runs.slice(1)]);
  }
  const text = runs.map((r) => r.t).join('');
  // A caption under a picture is the picture's (numbered by a SEQ field: "Figure 2: …", its label kept to number it).
  const prevImg = out[out.length - 1];
  const capWords = (t: string) => {
    const w = t.replace(/\s+/g, ' ').trim();
    if (!c.seq) return { caption: w };
    const m = new RegExp(`^${c.seq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\d+\\s*[:.–—-]?\\s*`, 'i').exec(w);
    return { label: c.seq, caption: m ? w.slice(m[0].length) : w };
  };
  if (k.caption && prevImg?.type === 'image' && !prevImg.caption && text.trim() && !c.after.length) {
    const cw = capWords(text);
    if (cw.caption) prevImg.caption = cw.caption;
    if (cw.label) prevImg.label = cw.label;
    ctx.capTarget = prevImg;
    return;
  }
  // A caption over a table: kept to be the table's, if one comes next (wordTable).
  if (k.caption && text.trim() && !c.after.length && depth === 0) {
    out.push({ type: 'p', runs, __cap: capWords(text) });
    return;
  }
  // A numbered equation, as this app writes one: the equation on its line, its number after a tab ("(3)").
  const om = kids(p, 'oMath');
  if (om.length === 1 && c.seq && /^\s*\(?\s*\d+\s*\)?\s*$/.test(text.replace(/\u2063/g, '').replace(runs.filter((r) => r.math).map((r) => r.t).join(''), ''))) {
    const tex = texOfOmml(om[0]);
    if (tex) {
      out.push({ type: 'math', tex, label: c.seq });
      return;
    }
  }
  // A checklist's item is a step (half an inch) further in a level, its box where its first line starts (left less hanging).
  const checkLvl = Math.min(4, Math.max(0, Math.floor((k.left - k.hanging + 180) / 720)));
  const raw = wordSpacing(pPr);
  const space = raw ? { [RAW]: raw } : {};
  // A shaded paragraph that starts with an emoji is a callout (as this app writes one: the emoji in a run of its own, then a tab).
  const shade = att(kid(pPr, 'shd'), 'fill');
  const shaded = !!shade && /^[0-9a-f]{6}$/i.test(shade) && !/^ffffff$/i.test(shade);
  const own = shaded && runs.length > 1 && cleanIcon(runs[0].t.trim()) && /^[\t ]/.test(runs[1].t) ? cleanIcon(runs[0].t.trim()) : undefined;
  if (own) runs = mergeRuns([{ ...runs[1], t: runs[1].t.replace(/^[\t ]+/, '') }, ...runs.slice(2)].filter((r) => r.t));
  const lead = own ? { icon: own, rest: runs[0]?.t ?? '' } : shaded ? leadingIcon(runs[0]?.t ?? '') : null;
  const block = (rs: Run[]): Record<string, unknown> => {
    if (c.check || k.list) return { type: 'li', list: c.check ? 'check' : k.list!.kind, lvl: k.list?.lvl ?? checkLvl, ...(c.checked ? { checked: true } : {}), ...(k.align ? { align: k.align } : {}), ...space, runs: rs };
    if (lead && k.style === 'normal') return { type: 'p', style: 'callout', icon: lead.icon, tint: `#${shade!.toLowerCase()}`, ...(k.align ? { align: k.align } : {}), ...space, runs: rs.length ? mergeRuns([{ ...rs[0], t: lead.rest }, ...rs.slice(1)]) : [] };
    const b: Record<string, unknown> = { type: 'p', runs: k.style === 'code' ? [{ t: rs.map((r) => r.t).join('') }] : rs, ...space };
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
  } else if ((text || !c.after.length) && !(raw?.rule === 'exact' && (raw.line ?? 99) <= 1.5 && !text.trim() && depth === 0)) out.push(block(runs));
  out.push(...c.after);
  // A section that starts on a new page.
  const sect = kid(pPr, 'sectPr');
  if (sect && ['nextPage', 'oddPage', 'evenPage'].includes(att(kid(sect, 'type'), 'val') ?? 'nextPage') && depth === 0) out.push({ type: 'pagebreak' });
}

function wordTable(ctx: WCtx, tbl: El, out: Record<string, unknown>[], depth: number) {
  const rowsOf = (el: El): El[] => kids(el).flatMap((x) => (x.n === 'tr' ? [x] : x.n === 'sdt' || x.n === 'sdtContent' || x.n === 'customXml' ? rowsOf(x) : []));
  const cellsOf = (el: El): El[] => kids(el).flatMap((x) => (x.n === 'tc' ? [x] : x.n === 'sdt' || x.n === 'sdtContent' || x.n === 'customXml' ? cellsOf(x) : []));
  type WCell = { runs: Run[]; align?: Align; fill?: string; va?: 'middle' | 'bottom'; rs?: number; cs?: number };
  const rows: WCell[][] = [];
  let head = false;
  // Each column's cell merged down that is still open (by where it is), for the cells under it.
  const down = new Map<number, WCell>();
  // Its rows added or taken out as tracked changes (every row so: the table is a suggestion).
  const revs: El[] = [];
  rowsOf(tbl)
    .slice(0, DOC_LIMITS.rows)
    .forEach((tr, ri) => {
      if (ri === 0 && on(xpath(tr, 'trPr', 'tblHeader'))) head = true;
      const rev = xpath(tr, 'trPr', 'ins') ?? xpath(tr, 'trPr', 'del');
      if (rev) revs.push(rev);
      const row: WCell[] = [];
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
        const span = Math.max(1, Math.min(DOC_LIMITS.cols - row.length, Number(att(xpath(tc, 'tcPr', 'gridSpan'), 'val')) || 1));
        const at = row.length;
        const cell: WCell = { runs: cont ? [] : mergeRuns(runs), ...(align && align !== 'left' && !cont ? { align } : {}) };
        const fill = att(xpath(tc, 'tcPr', 'shd'), 'fill');
        if (fill && /^[0-9a-f]{6}$/i.test(fill) && !/^ffffff$/i.test(fill) && !cont) cell.fill = `#${fill.toLowerCase()}`;
        const va = att(xpath(tc, 'tcPr', 'vAlign'), 'val');
        if ((va === 'center' || va === 'bottom') && !cont) cell.va = va === 'center' ? 'middle' : 'bottom';
        if (span > 1 && !cont) cell.cs = span;
        // Merged down: the cell it starts grows a row for each cell under it Word joins to it.
        const top = down.get(at);
        if (cont && top) top.rs = (top.rs ?? 1) + 1;
        else if (merged === 'restart') down.set(at, cell);
        else down.delete(at);
        row.push(cell);
        for (let s = span; s > 1 && row.length < DOC_LIMITS.cols; s--) row.push({ runs: [] });
      }
      if (row.length) rows.push(row);
    });
  if (!rows.length) return;
  // Bookmarks in its cells lead to it.
  const cellMarks = all(tbl, 'bookmarkStart').map((b) => att(b, 'name') ?? '').filter((n) => n && n !== '_GoBack');
  // A first row all in bold is a header (its bold the header's own); a header row's bold, and the shading this app
  // gives one, are the header's own too.
  const bold = rows[0].every((c) => c.runs.every((r) => r.b || !r.t.trim())) && rows[0].some((c) => c.runs.some((r) => r.t.trim()));
  if ((head || rows.length > 1) && bold) {
    head = true;
    rows[0] = rows[0].map((c) => ({ ...c, runs: mergeRuns(c.runs.map(({ b: _b, ...r }) => r)) }));
  }
  if (head) rows[0] = rows[0].map(({ fill, ...c }) => (fill && /^#f3f(4f6|5f7)$/.test(fill) ? c : { ...c, ...(fill ? { fill } : {}) }));
  const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => Number(att(g, 'w')) || 0);
  const width = Math.max(...rows.map((r) => r.length));
  const kind = revs.length === rows.length && revs.every((r) => r.n === revs[0].n) ? (revs[0].n === 'ins' ? 'ins' : 'del') : null;
  const t: Record<string, unknown> = { type: 'table', rows, ...(head ? { head: true } : {}), ...(grid.length === width && grid.every((g) => g > 0) ? { cols: grid } : {}), ...(kind ? { [kind]: revSuggestion(ctx, revs[0]) } : {}) };
  // The caption just before it is its own.
  const prev = out[out.length - 1];
  if (prev?.__cap && depth === 0) {
    const cap = prev.__cap as { caption: string; label?: string };
    out.pop();
    if (cap.caption) t.caption = cap.caption;
    if (cap.label) t.label = cap.label;
    if (typeof prev.id === 'string') t.id = prev.id;
    if (typeof prev.__marks === 'object') t.__marks = prev.__marks;
  }
  out.push(t);
  if (cellMarks.length) markBlock(ctx, t, cellMarks);
}

/** Bookmarks that lead to a block: it gets an id they name (this app's own _Ref_<id>, else one of its own), and a bookmark of the document's for a name people gave. */
function markBlock(ctx: WCtx, b: Record<string, unknown>, names: string[]) {
  const own = names.map((n) => /^_Ref_([A-Za-z0-9_]{1,24})$/.exec(n)?.[1]).find(Boolean);
  if (typeof b.id !== 'string') b.id = own ?? `m${ctx.marks.size + 1}${Math.random().toString(36).slice(2, 6)}`;
  for (const n of names) ctx.marks.set(n, b.id as string);
  const named = names.find((n) => !n.startsWith('_'));
  if (named && (b.type === 'p' || b.type === 'li') && !b.bm) b.bm = named.replace(/_/g, ' ');
}

/** Cross-references and links to places, now that every bookmark's block is known: to that block, or (none) the words they showed. */
function refsAfter(ctx: WCtx, out: Record<string, unknown>[]) {
  const fix = (runs: (Run & { ref?: string })[]) => {
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.ref) {
        const id = ctx.marks.get(r.ref);
        runs[i] = id ? { t: id, xref: true, ...(r.cm ? { cm: r.cm } : {}) } : (({ ref: _r, xref: _x, ...x }) => x)(r);
      }
      if (r.link?.startsWith('#~')) {
        const id = ctx.marks.get(r.link.slice(2));
        if (id) runs[i] = { ...runs[i], link: `#${id}` };
        else {
          const { link: _l, ...x } = runs[i];
          runs[i] = x;
        }
      }
    }
  };
  for (const b of out) {
    delete b.__cap;
    delete b.__marks;
    if (Array.isArray(b.runs)) fix(b.runs as Run[]);
    if (Array.isArray(b.rows)) for (const row of b.rows as { runs: Run[] }[][]) for (const c of row) fix(c.runs);
  }
  for (const runs of ctx.notes.values()) fix(runs);
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
      case 'sdt': {
        // Word's own table of contents (a block it made): its heading kept, its lines one of ours.
        if (/table of contents/i.test(att(all(kid(x, 'sdtPr'), 'docPartGallery')[0], 'val') ?? '') && depth === 0) {
          const inner: Record<string, unknown>[] = [];
          const was = ctx.toc;
          wordBody({ ...ctx, toc: 0 }, kid(x, 'sdtContent') ?? x, inner, depth);
          ctx.toc = was;
          // Its own heading ("Contents"), in bold words rather than a heading of the document's.
          const until = inner.findIndex((b) => b.type === 'toc');
          const heads = inner.slice(0, Math.max(0, until)).filter((b) => b.type === 'p' && Array.isArray(b.runs));
          out.push(...heads.slice(0, 1).map((b) => ({ type: 'p', runs: (b.runs as Run[]).map((r) => ({ ...r, b: true })) })), { type: 'toc' });
          break;
        }
        wordBody(ctx, kid(x, 'sdtContent') ?? x, out, depth);
        break;
      }
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
  const ctx: WCtx = { zip, rels: r, styles, nums, theme, font: 'Arial', size: 11, textEmu: Math.max(1, pw - left - right) * 635, pics: 0, openCm: new Set(), cmIds: new Map(), toc: 0, rev: null, sugs: [], lastRev: null, plainSince: true, nextBreak: null, notes: new Map(), marksHere: [], marks: new Map() };
  // Footnotes and endnotes first (the words' marks are theirs), each read as a paragraph's words are.
  for (const [kind, type, prefix] of [
    ['footnote', 'footnotes', 'f'],
    ['endnote', 'endnotes', 'e'],
  ] as const) {
    const x = zip.text(part(type) ?? `word/${type}.xml`);
    if (!x) continue;
    for (const n of all(parseXml(x).root, kind)) {
      const t = att(n, 'type');
      if (t && t !== 'normal') continue;
      const id = `${prefix}${(att(n, 'id') ?? '').replace(/[^A-Za-z0-9_-]/g, '')}`;
      const runs: Run[] = [];
      for (const para of all(n, 'p')) {
        const pc: PCollect = { runs: [], after: [], breaks: [] };
        inline(ctx, para, pc, undefined);
        if (runs.length && pc.runs.length) runs.push({ t: '\n' });
        runs.push(...pc.runs.filter((x2) => !x2.fn));
      }
      if (runs[0]) runs[0] = { ...runs[0], t: runs[0].t.replace(/^\s+/, '') };
      ctx.notes.set(id, mergeRuns(runs.filter((x2) => x2.t)));
    }
  }
  const comments = wordComments(zip, part('comments'), part('commentsExtended'), ctx.cmIds);
  rLook(ctx, kid(defaults, 'rPr'), defLook);
  rLook(ctx, normal?.rPr, defLook);
  const font = defLook.font && FONTS.some((f) => f.name.toLowerCase() === defLook.font!.toLowerCase()) ? FONTS.find((f) => f.name.toLowerCase() === defLook.font!.toLowerCase())!.name : (defLook.font ?? 'Arial');
  ctx.font = font;
  ctx.size = defLook.size ?? 11;

  const out: Record<string, unknown>[] = [];
  wordBody(ctx, body, out, 0);
  refsAfter(ctx, out);
  ownSpacing(out, font, ctx.size);
  // A document's last empty paragraphs are left out.
  while (out.length > 1 && out[out.length - 1].type === 'p' && !(out[out.length - 1].runs as Run[]).some((x) => x.t.trim())) out.pop();
  if (out[out.length - 1]?.type === 'pagebreak') out.pop();
  // Its header and footer: the ones on most of its pages, as words (and the page's number where Word puts it).
  const bandOfPart = (kind: 'header' | 'footer') => {
    const ref = kids(sect, `${kind}Reference`).find((x) => (att(x, 'type') ?? 'default') === 'default');
    // A file that names no section's: its only one.
    const target = ref ? r.get(patt(ref, 'id') ?? att(ref, 'id') ?? '')?.target : [...r.values()].find((x) => x.type === kind)?.target;
    const x = target ? zip.text(target) : null;
    return x ? wordBand(parseXml(x).root) : undefined;
  };
  const header = bandOfPart('header');
  const footer = bandOfPart('footer');
  // Its page set up: on its side, in columns, in a colour; its watermark (in its header); the sources its citations cite.
  const orient = att(kid(sect, 'pgSz'), 'orient') === 'landscape' || pw > ph ? 'landscape' : undefined;
  const ncols = Number(att(kid(sect, 'cols'), 'num')) || 1;
  const bg = att(kid(droot, 'background'), 'color');
  const color = bg && /^[0-9a-f]{6}$/i.test(bg) && !/^ffffff$/i.test(bg) ? `#${bg.toLowerCase()}` : undefined;
  const mark = wordWatermark(zip, r, sect);
  let sources: Source[] = [];
  for (const name of zip.names().filter((n) => /^customXml\/item\d+\.xml$/i.test(n))) {
    const got = sourcesFromXml(zip.text(name) ?? '');
    if (got?.length) sources = [...sources, ...got];
  }
  const notes = [...ctx.notes].map(([id, runs]) => ({ id, runs }));
  const doc = normalizeDoc({
    page: { size: letter ? 'letter' : 'a4', margin, ...(orient ? { orient } : {}), ...(ncols > 1 ? { cols: Math.min(3, ncols) } : {}), ...(color ? { color } : {}) },
    font,
    size: ctx.size,
    blocks: out,
    header,
    footer,
    titlePage: !!kid(sect, 'titlePg') && on(kid(sect, 'titlePg')),
    comments,
    suggestions: ctx.sugs,
    notes,
    ...(sources.length ? { sources } : {}),
    ...(mark ? { mark } : {}),
    styles: wordStyles(zip, sroot, font, ctx.size),
  });
  // Each comment's quote: the words it is on, as they read.
  if (!doc.comments?.length) return doc;
  const quotes = new Map<string, string>();
  const take = (runs: Run[]) => {
    for (const x of runs) for (const id of x.cm ?? []) quotes.set(id, `${quotes.get(id) ?? ''}${x.math ? '…' : x.t}`);
  };
  for (const b of doc.blocks) {
    if (b.type === 'p' || b.type === 'li') take(b.runs);
    else if (b.type === 'table') for (const row of b.rows) for (const c of row) take(c.runs);
  }
  return { ...doc, comments: doc.comments.map((c) => (quotes.get(c.id)?.trim() ? { ...c, quote: quotes.get(c.id)!.replace(/\s+/g, ' ').trim().slice(0, 500) } : c)) };
}

/** What a Word style says of a paragraph's look: its size (pt), colour, font, weight, slant, alignment and spacing. */
function styleFacts(s: El | undefined) {
  const rPr = kid(s, 'rPr');
  const pPr = kid(s, 'pPr');
  const sp = kid(pPr, 'spacing');
  const sz = Number(att(kid(rPr, 'sz'), 'val'));
  const flag = (el: El | undefined) => (el ? !['0', 'false', 'off'].includes(att(el, 'val') ?? '') : undefined);
  const line = att(sp, 'line');
  const rule = att(sp, 'lineRule');
  return {
    size: sz > 0 ? sz / 2 : undefined,
    color: att(kid(rPr, 'color'), 'val')?.toLowerCase(),
    font: att(kid(rPr, 'rFonts'), 'ascii'),
    b: flag(kid(rPr, 'b')),
    i: flag(kid(rPr, 'i')),
    jc: att(kid(pPr, 'jc'), 'val'),
    before: att(sp, 'before') !== undefined ? Number(att(sp, 'before')) / 20 : undefined,
    after: att(sp, 'after') !== undefined ? Number(att(sp, 'after')) / 20 : undefined,
    line: line && (rule === 'atLeast' || rule === 'exact') ? Number(line) / 20 : undefined,
  };
}

/**
 * A document's own paragraph styles, read back from a Word file this app wrote: each style's look where it is not the
 * one the app writes for a document of the same font and size (a style changed in Word comes in too).
 */
function wordStyles(zip: Zip, sroot: El | undefined, font: string, size: number): Doc['styles'] | undefined {
  if (!sroot || !/<Application>Hydor<\/Application>/.test(zip.text('docProps/app.xml') ?? '')) return undefined;
  const base = parseXml(editorStylesXml({ font, size, editor: {} }, false)).root;
  const byId = (root: El, id: string) => kids(root, 'style').find((x) => att(x, 'styleId') === id);
  const ids: [ParaStyle, string][] = [
    ['title', 'Title'],
    ['subtitle', 'Subtitle'],
    ['h1', 'Heading1'],
    ['h2', 'Heading2'],
    ['h3', 'Heading3'],
    ['h4', 'Heading4'],
    ['quote', 'Quote'],
    ['code', 'Code'],
  ];
  const out: Record<string, Record<string, unknown>> = {};
  const near = (a: number | undefined, b: number | undefined) => a === undefined || b === undefined || Math.abs(a - b) < 0.6;
  for (const [k, id] of ids) {
    const f = styleFacts(byId(sroot, id));
    const d = styleFacts(byId(base, id));
    const x: Record<string, unknown> = {};
    if (f.size && !near(f.size, d.size)) x.size = f.size;
    if (f.color && f.color !== d.color) x.color = `#${f.color}`;
    if (f.font && f.font !== d.font) x.font = f.font;
    if ((f.b ?? false) !== (d.b ?? false)) x.b = !!f.b;
    if ((f.i ?? false) !== (d.i ?? false)) x.i = !!f.i;
    if (f.jc && f.jc !== d.jc) x.align = f.jc === 'both' ? 'justify' : f.jc;
    if (!near(f.before, d.before)) x.sb = f.before;
    if (!near(f.after, d.after)) x.sa = f.after;
    if (f.line && !near(f.line, d.line)) x.lh = Math.round((f.line / (1.15 * (f.size ?? d.size ?? size))) * 100) / 100;
    if (Object.keys(x).length) out[k] = x;
  }
  // Normal text: its colour (the file's default words' colour), weight, slant and alignment.
  const n = styleFacts(byId(sroot, 'Normal'));
  const dc = att(kid(kid(all(sroot, 'rPrDefault')[0], 'rPr'), 'color'), 'val')?.toLowerCase();
  const normal: Record<string, unknown> = {};
  if (dc && dc !== '1f2328') normal.color = `#${dc}`;
  if (n.b) normal.b = true;
  if (n.i) normal.i = true;
  if (n.jc) normal.align = n.jc === 'both' ? 'justify' : n.jc;
  if (Object.keys(normal).length) out.normal = normal;
  return Object.keys(out).length ? (out as Doc['styles']) : undefined;
}

/** A Word file's watermark (in its default header): its words, or its picture inside the document. */
function wordWatermark(zip: Zip, r: ReturnType<typeof rels>, sect: El | undefined): { text?: string; src?: string } | undefined {
  const ref = kids(sect, 'headerReference').find((x) => (att(x, 'type') ?? 'default') === 'default');
  const target = ref ? r.get(patt(ref, 'id') ?? att(ref, 'id') ?? '')?.target : undefined;
  const x = target ? zip.text(target) : null;
  if (!x) return undefined;
  const w = watermarkOf(x);
  if (!w) return undefined;
  if (w.text) return { text: w.text };
  const pic = w.rid ? rels(zip, target!).get(w.rid)?.target : undefined;
  const data = pic ? zip.read(pic, 13 * 1024 * 1024) : null;
  const mime = data ? pictureType(data) : null;
  return data && mime ? { src: `data:${mime};base64,${data.toString('base64')}` } : undefined;
}

/** A header's or footer's words, from its part: its paragraphs' words on one line, {page} and {pages} for Word's fields. */
function wordBand(root: El): Band | undefined {
  let text = '';
  let align: Band['align'];
  for (const p of all(root, 'p')) {
    const jc = att(kid(kid(p, 'pPr'), 'jc'), 'val');
    if (!align && (jc === 'center' || jc === 'right' || jc === 'end')) align = jc === 'center' ? 'center' : 'right';
    let field: string | null = null;
    let line = '';
    const walk = (el: El) => {
      for (const x of el.c) {
        if (!isEl(x)) continue;
        if (x.n === 'fldSimple') {
          const instr = att(x, 'instr') ?? '';
          line += /\bNUMPAGES\b/.test(instr) ? '{pages}' : /\bPAGE\b/.test(instr) ? '{page}' : '';
          continue;
        }
        if (x.n === 'fldChar') {
          const t = att(x, 'fldCharType');
          if (t === 'begin') field = '';
          else if (t === 'separate' && field !== null) {
            line += /\bNUMPAGES\b/.test(field) ? '{pages}' : /\bPAGE\b/.test(field) ? '{page}' : '';
            field = 'result';
          } else if (t === 'end') field = null;
          continue;
        }
        if (x.n === 'instrText' && field !== null && field !== 'result') field += x.c.map((y) => (typeof y === 'string' ? y : '')).join('');
        else if (x.n === 't' && field === null) line += x.c.map((y) => (typeof y === 'string' ? y : '')).join('');
        else if (x.n === 'tab' && field === null) line += '   ';
        else walk(x);
      }
    };
    walk(p);
    if (line.trim()) text += `${text ? ' ' : ''}${line.trim()}`;
  }
  return text.trim() ? { text: text.trim().slice(0, DOC_LIMITS.band), ...(align ? { align } : {}) } : undefined;
}

/** A Word file's comments (and their replies, and whether each was resolved), by their ids here; Word's ids to ours in `ids`. */
function wordComments(zip: Zip, part: string | undefined, extended: string | undefined, ids: Map<string, string>): Comment[] {
  const x = part ? zip.text(part) : null;
  if (!x) return [];
  // commentsExtended: whose reply each is (by its last paragraph's id), and whether its thread is done.
  const parentOf = new Map<string, string>();
  const done = new Set<string>();
  const ex = extended ? zip.text(extended) : null;
  if (ex)
    for (const e of all(parseXml(ex).root, 'commentEx')) {
      const pid = att(e, 'paraId');
      if (!pid) continue;
      const parent = att(e, 'paraIdParent');
      if (parent) parentOf.set(pid, parent);
      if (att(e, 'done') === '1') done.add(pid);
    }
  const out: Comment[] = [];
  const byPara = new Map<string, Comment>();
  for (const c of all(parseXml(x).root, 'comment')) {
    const wid = att(c, 'id') ?? '';
    const ps = kids(c, 'p');
    const text = ps
      .map((p) => all(p, 't').map((t) => t.c.map((y) => (typeof y === 'string' ? y : '')).join('')).join(''))
      .join('\n')
      .trim();
    const pid = att(ps[ps.length - 1], 'paraId') ?? '';
    const at = Date.parse(att(c, 'date') ?? '') || Date.now();
    const by = /^agent$/i.test(att(c, 'author') ?? '') ? 'agent' : 'user';
    // Its author by name (Maria Lopez), but for the names this app writes for you and an agent.
    const author = cleanAuthor(att(c, 'author'));
    const parent = pid ? byPara.get(parentOf.get(pid) ?? '') : undefined;
    if (parent) {
      // A reply: its words join its thread's, and its marks are its thread's.
      if (text) (parent.replies ??= []).push({ id: `r${out.length}${parent.replies?.length ?? 0}`, by, ...(author ? { author } : {}), text, at });
      ids.set(wid, parent.id);
      continue;
    }
    if (!text) continue;
    const id = `w${wid.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30) || out.length}`;
    const k: Comment = { id, by, ...(author ? { author } : {}), text, at };
    if (done.has(pid)) k.resolved = true;
    ids.set(wid, id);
    if (pid) byPara.set(pid, k);
    out.push(k);
  }
  return out;
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
 * Files words for the person: "headers" for headers and footers with more than a line of words (pictures, tables,
 * other ones on even pages), "footnotes", "charts",
 * "diagrams" for SmartArt, "objects" for embedded files, "boxes" for text boxes, whose words come in after their
 * paragraph, "columns", "layout" for pages laid out apart, such as a landscape section); and `cut`, whether `doc`,
 * read from it, came in short of its words (a document longer than one here may be). Comments, tracked changes (as
 * suggested changes), equations and a table of contents come in as the document's own.
 */
export function wordLosses(buf: Buffer, doc: Doc): { loses: string[]; cut: boolean } {
  const zip = new Zip(buf);
  const mainRel = [...rels(zip, '').values()].find((x) => x.type === 'officeDocument')?.target;
  const main = mainRel && zip.has(mainRel) ? mainRel : 'word/document.xml';
  const xml = zip.text(main) ?? '';
  const r = [...rels(zip, main).values()];
  const loses = new Set<string>();
  const words = /<w:t(?:\s[^>]*)?>[^<]*\S/;
  // A header or footer is kept as a line of words: one with a picture or a table, or one only on even pages, is not.
  const bands = r.filter((x) => x.type === 'header' || x.type === 'footer').map((x) => zip.text(x.target) ?? '');
  if (bands.some((x) => words.test(x) && /<w:(?:drawing|pict|tbl)[\s>]/.test(x)) || /<w:(?:header|footer)Reference\s[^>]*w:type="even"/.test(xml)) loses.add('headers');

  if (r.some((x) => x.type === 'chart') || /<c:chart[\s/>]/.test(xml)) loses.add('charts');
  if (r.some((x) => x.type === 'diagramData')) loses.add('diagrams');
  if (r.some((x) => x.type === 'oleObject' || x.type === 'package') || /<o:OLEObject[\s/>]/.test(xml)) loses.add('objects');
  if (/<w:txbxContent[\s>]/.test(xml)) loses.add('boxes');
  // Footnotes and endnotes come in as the document's footnotes, but for marks whose notes the file does not have.
  if (/<w:(?:footnote|endnote)Reference[\s/>]/.test(xml) && !r.some((x) => x.type === 'footnotes' || x.type === 'endnotes')) loses.add('footnotes');
  // Columns, and pages on their side, are the document's own when its sections all have them alike.
  const colsSeen = new Set([...xml.matchAll(/<w:cols\b[^>]*?\/?>/g)].map((m) => /w:num="(\d+)"/.exec(m[0])?.[1] ?? '1'));
  if (colsSeen.size > 1 || [...colsSeen].some((n) => Number(n) > 3)) loses.add('columns');
  const sizes = new Set([...xml.matchAll(/<w:pgSz\s[^>]*?\/>/g)].map((m) => m[0].replace(/\s+w:code="[^"]*"/, '')));
  if (sizes.size > 1) loses.add('layout');
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
  'page: {"size": "a4" or "letter", "margin": millimetres, "orient": "landscape" (portrait unless said), "cols": 2 or 3 (columns of words on every page), "color": "#fef7e0" (the paper’s colour)} (A4 and 25.4 mm unless said); watermark: "DRAFT" (words across every page, faint) or {"src": a picture}, "" for none; styles: the paragraph styles’ own looks, {"h1": {"font": "Georgia", "size": 20, "color": "#1a73e8", "bold": true, "italic": false, "line": 1.15, "before": 18, "after": 6, "align": "center"}, "normal": {…}, "title": …, "subtitle", "h2"–"h4", "quote", "code", "callout"} (sizes and spaces in points, lines in lines), as Format → Paragraph styles sets them; font: the body text’s (Arial unless said; others: Georgia, Times New Roman, Inter, Roboto, Open Sans, Lato, Merriweather, Lora, Source Serif 4…); size: the body text’s in points (11). Headings and the title are sized from it.',
  'More in markdown: > 💡 words {.callout} is a callout, a tinted box with its emoji (tint=#e8f0fe for another tint; GitHub’s > [!NOTE], [!TIP], [!WARNING] work too); {line=1.5 before=12 after=6} at a paragraph’s end sets its line spacing (in lines) and the space before and after it (in points); $$ on lines of their own around LaTeX is an equation, and $x^2$ is maths among words (write a dollar sign as \\$); [TOC] alone on a line is a table of contents, made from the headings and kept up to date. A table with merged or shaded cells is written as HTML: <table><tr><td colspan="2" rowspan="2" style="background-color:#e8f0fe; vertical-align:middle">…</td></tr></table>.',
  'Footnotes: a mark [^1] in the words and, after the document, [^1]: its words (a line that goes on, indented); they are numbered and printed at the foot of their page. Citations: [@key] or [@key1; @key2, p. 4], each key a source in sources (objects {id, kind: article|book|chapter|conference|thesis|report|web|other, title, authors: [{family, given}] or "Family, Given and …", year, in: the journal, book or site, volume, issue, pages, publisher, doi, url}, or BibTeX entries in bibtex), written in the citation style cite: apa (unless said), mla, chicago or ieee; [BIBLIOGRAPHY] alone on a line lists the sources cited, kept up to date (put a heading such as # References before it). Sources sent are added to those the document has (by key).',
  'Numbered captions and cross-references: a picture’s caption numbered as a figure with {label=Figure} after it (![…](src "Its caption"){label=Figure}); a table’s with a line Table: its caption {label=Table} before it; an equation’s with $$ … $$ {label=Equation}. Give what you refer to an id with {#id} (on a heading, a picture, a Table: line, an equation, a paragraph) and refer to it with <ref to="id"/>, which shows “Figure 2”, “Table 1”, “Equation 3” or the heading’s words; [words](#id) links to it; {bookmark="Name"} at a paragraph’s end makes it a bookmark of the document.',
  'header and footer: a line of words on every page’s top and bottom margin, {page} and {pages} for the page’s number and how many there are: "footer": {"text": "Page {page} of {pages}", "align": "center"} (align left unless said); "titlePage": true leaves them off the first page. Left out, they stay as they were; "" removes one.',
  'Comments: get_page lists the user’s comments after the document, each on the words marked <span data-comment="id">. Answer with comments: [{"id": "c1", "reply": "…", "resolve": true}] beside the document (make the change asked for, too); {"id": "c1", "reopen": true} reopens one, {"id": "c1", "delete": true} takes it out. To add one of your own, mark its words <span data-comment="new1">…</span> and add {"id": "new1", "text": "…"}. Comments you do not mention stay as they are; keep their marks where they are.',
  'Suggested changes (as Word’s tracked changes): get_page lists them after the comments, each marked with its id: <ins data-s="s1">words to add</ins>, <del data-s="s1">words to take out</del>, <span data-s="s2" data-was="…">a new look</span>, {ins=s3} or {del=s3} at a paragraph’s end for its break. Answer with suggestions: [{"id": "s1", "accept": true}], {"id": "s1", "reject": true} or {"id": "s1", "reply": "…"}; keep the marks of the others as they are. To suggest your own changes instead of making them (when the user asks you to suggest, review or propose edits), send the whole document as you would have it with "suggest": true: each difference becomes a suggestion of yours, which the user accepts or rejects. Or mark them yourself: <ins data-s="new1">…</ins> and <del data-s="new1">…</del> with an id of your own.',
  'Good documents start with a title, have short headings that say what follows, short paragraphs, lists for steps and options, and tables for what is compared.',
  'To change a document, get_page with its id gives it as markdown; send the whole document back with save_doc and the same id, or only what changes with edits: a new version, the older ones restorable. Keep what the user changed, and what you were not asked to change, as it is.',
  DOC_EDITS_HELP,
  'page_action accepts or rejects suggested changes (all, or by id), sets the page up (paper, margins, font and size, landscape, columns, the page’s colour, a watermark), the header and footer, a paragraph style’s look (or every style as the app has them) and the citation style, without sending the document back.',
].join(' ');

export const SAVE_DOC_DESCRIPTION = DOC_HELP;

export const SAVE_DOC_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved document’s id, to save a new version of it.' },
    title: { type: 'string', description: 'The document’s name in the Library: "Offer letter".' },
    markdown: { type: 'string', description: 'The whole document, in Markdown (as above).' },
    blocks: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'object' }] }, description: 'Instead of markdown: the document’s blocks, in order.' },
    page: { description: '{"size": "a4" | "letter", "margin": mm, "orient"?: "landscape", "cols"?: 2 | 3, "color"?: "#rrggbb"}, or "a4" or "letter".', anyOf: [{ type: 'string' }, { type: 'object' }] },
    sources: { type: 'array', items: { anyOf: [{ type: 'object' }, { type: 'string' }] }, description: 'Sources to cite as [@key]: {"id": "smith2020", "kind": "article", "title": "…", "authors": [{"family": "Smith", "given": "Jo"}], "year": "2020", "in": "Nature", "volume", "issue", "pages", "publisher", "doi", "url"}, or BibTeX entries. Added to the document’s (by key).' },
    bibtex: { type: 'string', description: 'Instead of sources: BibTeX entries to cite as [@key].' },
    cite: { type: 'string', enum: ['apa', 'mla', 'chicago', 'ieee'], description: 'The citation style (APA unless said).' },
    watermark: { description: 'Words across every page ("DRAFT"), or {"src": a picture}; "" removes it.', anyOf: [{ type: 'string' }, { type: 'object' }] },
    styles: { type: 'object', description: 'The paragraph styles’ own looks: {"h1": {"font", "size", "color", "bold", "italic", "line", "before", "after", "align"}, "normal": …}. Left out, they stay as they were; {} resets them.' },
    font: { type: 'string', description: 'The body text’s font: "Arial", "Georgia"…' },
    size: { type: 'number', description: 'The body text’s size in points: 11.' },
    header: { description: 'Words on every page’s top margin ({page}, {pages} for page numbers): a string, or {"text": "…", "align": "left" | "center" | "right"}; "" removes it.', anyOf: [{ type: 'string' }, { type: 'object' }] },
    footer: { description: 'Words on every page’s bottom margin, as header: {"text": "Page {page} of {pages}", "align": "center"}.', anyOf: [{ type: 'string' }, { type: 'object' }] },
    titlePage: { type: 'boolean', description: 'true: no header or footer on the first page.' },
    comments: {
      type: 'array',
      items: { type: 'object' },
      description: 'Changes to the comments: {"id": "c1", "reply": "…"}, {"id": "c1", "resolve": true}, {"id": "c1", "reopen": true}, {"id": "c1", "delete": true}, or a new one: {"id": "new1", "text": "…"} on the words marked <span data-comment="new1">.',
    },
    suggestions: {
      type: 'array',
      items: { type: 'object' },
      description: 'Answers to the suggested changes get_page lists: {"id": "s1", "accept": true}, {"id": "s1", "reject": true}, {"id": "s1", "reply": "…"}.',
    },
    suggest: { type: 'boolean', description: 'true: your changes to the document are suggested (each a suggestion the user accepts or rejects) rather than made.' },
    edits: {
      type: 'array',
      items: { type: 'object' },
      description:
        'With id, instead of markdown: changes made in order on its Markdown as get_page gives it: {"find": "…", "replace": "…", "all"?: true}, {"section": "a heading’s words", "markdown": "…"}, {"after": "a heading’s words", "markdown": "…"}, {"before": "…", "markdown": "…"}, {"append": "markdown"}.',
    },
  },
  required: ['title'],
};
