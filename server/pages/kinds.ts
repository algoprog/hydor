// The kinds of page Pages keeps besides pages of HTML: slide decks, documents, spreadsheets, LaTeX and notebooks. Each keeps a
// model as text (a line per part, so two versions read as a diff of lines), checked as it comes in, and knows
// how to make its own page from it (a viewer, every page to print, or a still picture), what an agent is told
// of it, which files it exports as, and which files it can be made from.
import type { DB } from '../db.ts';
import { HttpError } from '../auth.ts';
import { ASSET, asAccepted, docMarkdown, docSources, mapDocSources, newDoc } from '../../shared/docs.ts';
import { newTex, texSources } from '../../shared/latex.ts';
import { newBook } from '../../shared/sheets.ts';
import { deckSounds, deckSources, deckVideos, newDeck } from '../../shared/slides.ts';
import { assetDataUrl } from './assets.ts';
import { docForAgent, docFromFile, docPage, docxOfDoc, keepDoc, MAX_DOC, readDoc } from './docs.ts';
import { importTex, keepTex, MAX_TEX, readTex, TEX_OPENS, texForAgent, texPage, texPdf, texSource, texZip } from './latex.ts';
import { pptxFile, type Picture } from './pptx.ts';
import { deckFontFiles } from './pptx-fonts.ts';
import { deckFromPptx } from './pptx-import.ts';
import { bookForAgent, bookPage, csvOfBook, importBook, keepBook, MAX_BOOK, readBook, xlsxOfBook } from './sheets.ts';
import { deckForAgent, deckPage, keepDeck, MAX_DECK, readDeck } from './slides.ts';
import { videoFileFor } from './videos.ts';
import type { EmbeddedFont } from './word-fonts.ts';
import { freshNotebook, keepNotebook, MAX_NOTEBOOK, notebookForAgent, notebookFromFile, notebookPage, notebookScript, readNotebook } from './notebooks.ts';

export type PageKind = 'slides' | 'doc' | 'sheet' | 'tex' | 'notebook';
export type PageMode = 'viewer' | 'print' | 'still';
export type ExportFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'csv' | 'md' | 'tex' | 'zip' | 'html' | 'ipynb' | 'py' | 'png';

/** A file opened as a page of a kind: its model, and what was left out of it (said to the person who opened it). */
export interface FromFile {
  model: unknown;
  notes?: string[];
}

/** What an export gets besides the model: pictures made ready for Office files, and how text was fitted. */
export interface ExportHelp {
  picture: (src: string) => Picture | null;
  scales?: Map<string, number>;
  /** Parts made into pictures in a browser (a deck's icons and equations). */
  renders?: Map<string, Picture>;
  /** A document's fonts for its Word file, the faces it uses (word-fonts.ts). */
  wordFonts?: Map<string, EmbeddedFont>;
  /** Something to say of the file made (which fonts went inside a PowerPoint file, and how). */
  note?: (text: string) => void;
}

export interface KindDef {
  /** What people and agents call it: "slide deck". */
  noun: string;
  /** The tool agents save it with. */
  tool: string;
  /** The longest its kept text may be (its pictures are kept apart). */
  max: number;
  /** What the editor or the API sent, checked: the text to keep and the pictures it shows. */
  keep(db: DB, input: unknown): { text: string; sources: string[] };
  /** The model from its kept text, for the editor. */
  read(text: string): unknown;
  /** Its own page: to click through, to print (its @page size set by itself), or its first page still. */
  page(db: DB, text: string, title: string, mode: PageMode): string | Promise<string>;
  /** What get_page tells an agent. */
  forAgent(text: string): string;
  /** The picture sources it shows (for an export to make them ready). */
  sources(text: string): string[];
  /** The files it exports as, besides a PDF and a web page (which every kind has, from its own page, unless it makes its own). */
  files: Partial<Record<ExportFormat, (db: DB, text: string, title: string, help: ExportHelp) => Buffer | string | Promise<Buffer | string>>>;
  /** The size its still picture is taken at. */
  still: (text: string) => { width: number; height: number };
  /** A new one, empty but for its title (what New makes). */
  fresh: (title: string) => unknown;
  /** Made from a file someone opens (a .docx, a .csv…): the model, given to `keep`, and what could not come along (`db` keeps what goes beside the model, a deck's videos). */
  fromFile?: (buf: Buffer, name: string, db?: DB) => FromFile | Promise<FromFile>;
  /** The file names it is made from. */
  opens?: RegExp;
}

const KINDS = new Map<PageKind, KindDef>();

KINDS.set('slides', {
  noun: 'slide deck',
  tool: 'save_slides',
  max: MAX_DECK,
  keep: (db, input) => {
    const { deck, text } = keepDeck(db, input);
    // Its kept videos (and its slides' narrations) stay while a version shows them, as its pictures do.
    return { text, sources: [...deckSources(deck), ...deckVideos(deck), ...deckSounds(deck)] };
  },
  read: readDeck,
  page: (db, text, title, mode) => deckPage(db, readDeck(text), title, mode),
  forAgent: deckForAgent,
  // With YouTube's own stills of videos, for the PowerPoint file.
  sources: (text) => deckSources(readDeck(text), true),
  files: {
    // Its videos from a device go into the PowerPoint file, and into the web page (a file on its own) where small enough.
    pptx: async (db, text, title, help) => {
      // Each video read once, however many slides show it.
      const read = new Map<string, ReturnType<typeof videoFileFor>>();
      const video = (src: string) => (read.has(src) ? read.get(src)! : (read.set(src, videoFileFor(db, src)), read.get(src)!));
      const deck = readDeck(text);
      // The faces of the app's fonts it shows go inside it (no Office computer has them; none offline).
      const fonts = await deckFontFiles(deck);
      return pptxFile(deck, { title, picture: help.picture, scales: help.scales, renders: help.renders, video, fonts, note: help.note });
    },
    html: (db, text, title) => deckPage(db, readDeck(text), title, 'viewer', { videosInside: true }),
  },
  still: (text) => ({ width: 1280, height: /"ratio":"4:3"/.test(text.slice(0, 200)) ? 960 : 720 }),
  fresh: (title) => newDeck(title),
  // A PowerPoint file, its slides as the deck's (pptx-import.ts).
  fromFile: (buf, _name, db) => deckFromPptx(buf, db),
  opens: /\.(pptx|ppsx|potx|pptm)$/i,
});

KINDS.set('doc', {
  noun: 'document',
  tool: 'save_doc',
  max: MAX_DOC,
  keep: (db, input) => {
    const { doc, text } = keepDoc(db, input);
    return { text, sources: docSources(doc) };
  },
  read: readDoc,
  page: (db, text, title, mode) => docPage(db, readDoc(text), title, mode),
  forAgent: docForAgent,
  sources: (text) => docSources(readDoc(text)),
  files: {
    docx: (db, text, title, help) => docxOfDoc(db, readDoc(text), title, help.picture, help.wordFonts),
    // A file on its own: its pictures go inside it; Markdown has no way to show suggested changes, so they are made.
    md: (db, text) => docMarkdown(mapDocSources(asAccepted(readDoc(text)), (src) => (src.startsWith(ASSET) ? (assetDataUrl(db, src.slice(ASSET.length)) ?? src) : src)), { tocLinks: true }),
  },
  still: () => ({ width: 1280, height: 800 }),
  fresh: (title) => newDoc(title),
  fromFile: (buf, name) => ({ model: docFromFile(buf, name) }),
  opens: /\.(docx|docm|dotx|md|markdown|txt|html?)$/i,
});

KINDS.set('sheet', {
  noun: 'spreadsheet',
  tool: 'save_sheet',
  max: MAX_BOOK,
  keep: (_db, input) => ({ text: keepBook(input).text, sources: [] }),
  read: readBook,
  page: (_db, text, title, mode) => bookPage(readBook(text), title, mode),
  forAgent: bookForAgent,
  sources: () => [],
  files: {
    xlsx: (_db, text, title) => xlsxOfBook(readBook(text), title),
    csv: (_db, text) => csvOfBook(readBook(text)),
  },
  still: () => ({ width: 1280, height: 800 }),
  fresh: (title) => newBook(title),
  fromFile: (buf, name) => {
    const { book, notes } = importBook(buf, name);
    return { model: book, notes };
  },
  opens: /\.(xlsx|csv|tsv|ods)$/i,
});

KINDS.set('tex', {
  noun: 'LaTeX document',
  tool: 'save_latex',
  max: MAX_TEX,
  keep: (db, input) => {
    const { doc, text } = keepTex(db, input);
    return { text, sources: texSources(doc) };
  },
  read: readTex,
  page: (db, text, title, mode) => texPage(db, readTex(text), title, mode),
  forAgent: texForAgent,
  sources: (text) => texSources(readTex(text)),
  files: {
    // The PDF LaTeX makes, not a print of its page.
    pdf: (db, text) => texPdf(db, readTex(text)),
    tex: (_db, text) => texSource(readTex(text)),
    zip: (db, text) => texZip(db, readTex(text)),
  },
  still: () => ({ width: 1280, height: 800 }),
  fresh: (title) => newTex(title),
  fromFile: async (buf, name) => {
    const { doc, notes } = await importTex(buf, name);
    return { model: doc, notes };
  },
  opens: TEX_OPENS,
});

KINDS.set('notebook', {
  noun: 'notebook',
  tool: 'save_notebook',
  max: MAX_NOTEBOOK,
  keep: (_db, input) => ({ text: keepNotebook(input).text, sources: [] }),
  read: readNotebook,
  page: (_db, text, title, mode) => notebookPage(text, title, mode),
  forAgent: notebookForAgent,
  sources: () => [],
  files: {
    ipynb: (_db, text) => text,
    py: (_db, text) => notebookScript(text),
  },
  still: () => ({ width: 1280, height: 800 }),
  fresh: (title) => freshNotebook(title),
  fromFile: (buf) => ({ model: notebookFromFile(buf) }),
  opens: /\.ipynb$/i,
});

export function kindOf(k: string | null | undefined): KindDef | null {
  return k ? (KINDS.get(k as PageKind) ?? null) : null;
}

export function mustKind(k: string): KindDef {
  const d = kindOf(k);
  if (!d) throw new HttpError(400, `Pages has no kind “${k}”: slides, doc, sheet, tex or notebook`);
  return d;
}

/** The kind a file opens as, by its name. */
export function kindForFile(name: string): PageKind | null {
  for (const [k, d] of KINDS) if (d.opens?.test(name)) return k;
  return null;
}

export const kinds = () => [...KINDS.keys()];
