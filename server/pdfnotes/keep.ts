// A PDF's notes kept in a project's knowledge: one Markdown document named after the paper ("<title> (notes).md"), in
// the files of the project's first knowledge base (one is made for the project when it has none, as its Knowledge tab
// does), so the project's sessions find the highlights and notes when they search its documents (knowledge_search),
// cited by the paper's page. Every later change to the notes writes it again, and the base reads it again; Stop
// keeping takes it out. A paper moved in Files keeps its document, which then names the new place.
import fs from 'node:fs';
import path from 'node:path';
import type { PdfHighlight, PdfNotesKept } from '../../shared/pdfnotes.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { freeName } from '../files.ts';
import { scanSoon } from '../knowledge/indexer.ts';
import { baseRows, createBase, filesDir } from '../knowledge/store.ts';
import { spaceById } from '../spaces/index.ts';
import { ordered } from './store.ts';

/** The document: the paper's title, then each highlight by page: its words (or a line for an area) and its note. */
export function notesDocument(title: string, file: string, hs: PdfHighlight[]): string {
  const out = [`# ${title}`, '', `My highlights and notes on the paper ${path.basename(file)}, page by page. The PDF is at ${file}.`];
  if (!hs.length) out.push('', 'No highlights now.');
  let page = 0;
  for (const h of ordered(hs)) {
    if (h.page !== page) {
      page = h.page;
      out.push('', `## Page ${page}`, '');
    }
    const words = (h.text ?? '').replace(/\s+/g, ' ').trim();
    out.push(h.kind === 'area' ? `- A figure or an equation, picked as a part of the page${words ? `, with the words: “${words}”` : ''}` : `- “${words}”`);
    const note = h.note?.trim();
    if (note) out.push(...note.split('\n').map((l, i) => `  ${i ? '' : 'My note: '}${l}`.trimEnd()));
  }
  return out.join('\n') + '\n';
}

/** A title as a file's name: what a file system takes, not too long. */
const fileName = (title: string) =>
  `${
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 100)
      .trim() || 'Paper'
  } (notes).md`;

/** The knowledge base a project's notes go in: its first, or a new one named after it. */
function baseFor(db: DB, space: string): { id: string; made: boolean } {
  const sp = spaceById(db, space);
  if (!sp) throw new HttpError(404, 'No such project');
  const have = baseRows(db).find((b) => b.space === sp.id);
  if (have) return { id: have.id, made: false };
  return { id: createBase(db, { name: sp.name, space: sp.id }).id, made: true };
}

/**
 * Writes the notes into a project's knowledge (or again where they are kept): the document's place, and whether a
 * knowledge base was made for them.
 */
export function keepIn(db: DB, space: string, was: PdfNotesKept | undefined, title: string, file: string, hs: PdfHighlight[]): { kept: PdfNotesKept; made: boolean } {
  const base = baseFor(db, space);
  const dir = filesDir(base.id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let doc = was && was.base === base.id && path.dirname(was.file) === dir ? was.file : '';
  if (was && !doc) dropDocument(db, was);
  if (!doc) doc = freeName(dir, fileName(title));
  fs.writeFileSync(doc, notesDocument(title, file, hs));
  scanSoon(db, base.id);
  return { kept: { space, base: base.id, file: doc, at: Date.now() }, made: base.made };
}

/** The notes changed: their document is written again, where it is; null when its base is gone (kept no longer). */
export function rewrite(db: DB, kept: PdfNotesKept, title: string, file: string, hs: PdfHighlight[]): PdfNotesKept | null {
  if (!baseRows(db).some((b) => b.id === kept.base)) {
    // Its base was deleted: into the project's knowledge again, while the project is there.
    if (!spaceById(db, kept.space)) return null;
    return keepIn(db, kept.space, undefined, title, file, hs).kept;
  }
  fs.mkdirSync(path.dirname(kept.file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(kept.file, notesDocument(title, file, hs));
  scanSoon(db, kept.base);
  return kept;
}

/** Takes the document out of the project's knowledge. */
export function dropDocument(db: DB, kept: PdfNotesKept) {
  fs.rmSync(kept.file, { force: true });
  if (baseRows(db).some((b) => b.id === kept.base)) scanSoon(db, kept.base);
}
