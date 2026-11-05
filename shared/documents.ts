// A document read for a person or an agent (Word, Excel, PowerPoint, OpenDocument, EPUB, CSV): its
// content as blocks, sheets as cells and slides with their notes. The server reads it
// (server/documents), agents get it as Markdown-ish text, the file viewer shows it as a preview.
import type { TexFileKind } from './latex-files.ts';

/** A run of text, bold or italic, or a link. */
export interface Span {
  t: string;
  b?: 1;
  i?: 1;
  href?: string;
}

export type Block =
  | { k: 'h'; level: number; s: Span[] }
  | { k: 'p'; s: Span[] }
  /** A list item: `n` is its number ("3.", "b)") in a numbered list, none in a bulleted one. */
  | { k: 'li'; level: number; n?: string; s: Span[] }
  | { k: 'table'; rows: string[][] }
  | { k: 'img'; alt?: string }
  | { k: 'pre'; text: string };

/** A sheet's cells: rows as they are numbered in the sheet, columns from `col` (0 is A). */
export interface SheetCells {
  col: number;
  rows: { n: number; c: string[] }[];
  /** How many rows and columns have content, as far as is known. */
  totalRows: number;
  totalCols: number;
  /** It has more rows than are shown. */
  more?: boolean;
  /** A few of its formulas, by cell ("B5", "=SUM(B2:B4)"). */
  formulas?: [string, string][];
}

export interface DocPart {
  kind: 'body' | 'page' | 'sheet' | 'slide' | 'chapter' | 'extra';
  title?: string;
  hidden?: boolean;
  blocks: Block[];
  cells?: SheetCells;
  /** A slide's speaker notes. */
  notes?: Block[];
}

export interface DocModel {
  /** "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub", "csv", "pdf"… */
  format: string;
  title?: string;
  parts: DocPart[];
  /** What a reader should know: cut short, pages without text… */
  notes: string[];
}

/** What the file viewer gets to preview an Office file. */
export interface DocPreview {
  doc: DocModel;
  /** LibreOffice is here: the file can be shown as laid-out pages too. */
  pages: boolean;
}

/** File types the viewer previews (besides PDF, which it shows itself). */
export const PREVIEW_EXTS = ['docx', 'docm', 'dotx', 'xlsx', 'xlsm', 'xltx', 'pptx', 'pptm', 'potx', 'ppsx', 'odt', 'ott', 'ods', 'ots', 'odp', 'otp', 'epub', 'doc', 'xls', 'ppt', 'rtf'];

export const isPreviewable = (path: string) => PREVIEW_EXTS.includes(path.split('.').pop()?.toLowerCase() ?? '');

/** The editor of Pages a file opens in from Files, to change and save as the same file: the document, spreadsheet or LaTeX editor. */
export type FileEditorKind = 'doc' | 'sheet' | 'tex';

const EDITOR_KINDS: Record<string, FileEditorKind> = { docx: 'doc', xlsx: 'sheet', csv: 'sheet', tsv: 'sheet', tex: 'tex', ltx: 'tex' };

/** Which editor a file opens in (by its name), or null: it opens as text, a preview or a picture as before. */
export const editorKindOf = (path: string): FileEditorKind | null => EDITOR_KINDS[path.split('.').pop()?.toLowerCase() ?? ''] ?? null;

/** A file opened in one of those editors (GET /api/pages/file). */
export interface FileOpened {
  kind: FileEditorKind;
  path: string;
  mtime: number;
  /** The editor's model: a document, a workbook, a LaTeX project. */
  model: unknown;
  /**
   * What of the file the editor does not hold, so that saving over it loses it: keys Files puts in words (a Word
   * file's "headers", "footnotes", "comments", "changes"…; an Excel file's "charts", "merged", "pivots"…).
   */
  loses: string[];
  /** It did not come in whole (too long for the editor): it opens to be read only. */
  cut?: boolean;
  /** What else was said of it on the way in, in words. */
  notes: string[];
  /**
   * A LaTeX file's project: its folder, its main file there (the file itself, or the document that reads it), the
   * model's name of the file opened ("main.tex" for the main file), the times of the project's files by their path in
   * the folder (sent back when it is saved), and whether it is typeset among the folder's files. Its comments, which
   * the app keeps by each file's path, are in the model; saving sends back those it opened with (`comments`), so
   * what an agent did meanwhile is merged in. `uses`: the other files of the folder the document uses, which the editor
   * does not hold and TeX takes from the folder as they are (pictures, styles and classes, data; sources past the
   * document's limits), by their path in the folder, for the editor's files tree.
   */
  tex?: { folder: string; main: string; open: string; files: Record<string, number>; inFolder: boolean; uses?: { name: string; kind: TexFileKind; size: number }[] };
}

/** What saving it gives back (PUT /api/pages/file). */
export interface FileSaved {
  /** Where it was written (another file for a copy). */
  path: string;
  mtime: number;
  size: number;
  /** The file as it was, put in the trash first. */
  backup?: string;
  /** A LaTeX project's files' times now. */
  files?: Record<string, number>;
  /** A LaTeX project's comments as the app keeps them now (with what an agent did meanwhile), as the model has them. */
  comments?: unknown[];
  /** What the file could not keep of this save: "sheets" (a CSV holds one), "formulas" (saved as their values), "formatting". */
  dropped: string[];
}

/** Which kind of document a file is, for its icon and its name in words. */
export type DocKind = 'word' | 'sheet' | 'slides' | 'pdf' | 'image' | 'text' | 'code' | 'notebook' | 'archive' | 'audio' | 'video' | 'book' | 'web' | 'file';

const KINDS: Record<string, DocKind> = {
  doc: 'word', docx: 'word', docm: 'word', dotx: 'word', odt: 'word', ott: 'word', rtf: 'word', pages: 'word',
  xls: 'sheet', xlsx: 'sheet', xlsm: 'sheet', xltx: 'sheet', ods: 'sheet', ots: 'sheet', csv: 'sheet', tsv: 'sheet', numbers: 'sheet',
  ppt: 'slides', pptx: 'slides', pptm: 'slides', potx: 'slides', ppsx: 'slides', odp: 'slides', otp: 'slides', key: 'slides',
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', avif: 'image', bmp: 'image', heic: 'image', ico: 'image',
  md: 'text', txt: 'text', markdown: 'text', log: 'text',
  zip: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive', '7z': 'archive', rar: 'archive', xz: 'archive', bz2: 'archive',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio', aac: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
  epub: 'book',
  html: 'web', htm: 'web',
  js: 'code', ts: 'code', tsx: 'code', jsx: 'code', py: 'code', json: 'code', sh: 'code', css: 'code', yaml: 'code', yml: 'code', toml: 'code', xml: 'code', sql: 'code', go: 'code', rs: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code', rb: 'code', php: 'code',
  ipynb: 'notebook',
};

export const docKind = (path: string): DocKind => KINDS[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'file';

const KIND_WORDS: Record<DocKind, string> = {
  word: 'Document',
  sheet: 'Spreadsheet',
  slides: 'Presentation',
  pdf: 'PDF',
  image: 'Image',
  text: 'Text',
  code: 'Code',
  notebook: 'Notebook',
  archive: 'Archive',
  audio: 'Audio',
  video: 'Video',
  book: 'E-book',
  web: 'Web page',
  file: 'File',
};

/** "Word document", "Excel workbook", "PDF"…: what a file is, in words. */
export function kindLabel(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const named: Record<string, string> = {
    doc: 'Word document', docx: 'Word document', odt: 'OpenDocument text', rtf: 'Rich text',
    xls: 'Excel workbook', xlsx: 'Excel workbook', xlsm: 'Excel workbook', ods: 'OpenDocument sheet', csv: 'CSV table', tsv: 'TSV table',
    ppt: 'PowerPoint', pptx: 'PowerPoint', odp: 'OpenDocument slides',
    md: 'Markdown', zip: 'ZIP archive', epub: 'EPUB book', svg: 'SVG image', ipynb: 'Jupyter notebook',
  };
  return named[ext] ?? (KIND_WORDS[docKind(path)] === 'Image' && ext ? `${ext.toUpperCase()} image` : KIND_WORDS[docKind(path)]);
}
