// Highlights and notes on PDFs read in Files (server/pdfnotes): what the reader marks on a PDF's pages, kept by the app
// beside the file by its path (the file itself is never changed unless you save them into it), and the words of a page
// with where they are, which the reader lays over the page's picture so it can be selected as in any reader.

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

/** The marker colours, in the order the bar shows them. */
export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];

/** Each colour as the reader draws it (multiplied with the paper, so the words show through) and a PDF annotation keeps it. */
export const HIGHLIGHT_RGB: Record<HighlightColor, [number, number, number]> = {
  yellow: [255, 222, 89],
  green: [150, 226, 150],
  blue: [140, 196, 255],
  pink: [255, 160, 205],
};

/** A box on a page, in points from the page's top-left corner as it shows. */
export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfHighlight {
  id: string;
  /** From 1. */
  page: number;
  /** Words selected, or an area dragged around a figure or an equation (kept as a picture of that part of the page). */
  kind: 'text' | 'area';
  /** Where it is: a box for each line of words it covers; one box for an area. */
  rects: PdfRect[];
  /** The words highlighted, as they read (an area: the words inside it, if it has any). */
  text?: string;
  color: HighlightColor;
  note?: string;
  /** Where it starts in the page's reading order (its words as the page draws them), so lists keep a paper's columns apart. */
  o?: number;
  /** An area with words in it: the longest run of them and where it was, so the area moves with it when the file changes. */
  anchor?: PdfRect & { t: string };
  /** When it was made, and when its note or colour last changed (ms). */
  at: number;
  edited?: number;
  /** The file changed and its words were not found in it again: it stays where it was. */
  lost?: true;
}

/** Where a PDF's notes are kept in a project's knowledge: the project, its knowledge base, and the document there. */
export interface PdfNotesKept {
  space: string;
  base: string;
  file: string;
  at: number;
}

/** A PDF's notes as the reader gets them. */
export interface PdfNotesView {
  path: string;
  highlights: PdfHighlight[];
  /** Kept in a project's knowledge: which one (its name, while it exists), and the document's name. */
  kept?: PdfNotesKept & { spaceName?: string };
}

/**
 * A run of words on a page, as the reader lays it over the picture: its text, its box, and where each character
 * starts (`e`, one more than the characters: the last is where the run ends), in points from the page's top-left.
 */
export interface TextRun {
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
  e: number[];
}

/** Most highlights a PDF keeps, and the longest words and note one keeps. */
export const MAX_HIGHLIGHTS = 3000;
export const MAX_HIGHLIGHT_TEXT = 6000;
export const MAX_NOTE = 8000;

/**
 * Lines of words joined into the passage they read as: a word broken over a line's end ("effective-" "ness") is put
 * back together; other lines are joined with a space.
 */
export function joinLines(parts: string[]): string {
  let out = '';
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (!out) out = p;
    else if (/\p{L}-$/u.test(out) && /^\p{Ll}/u.test(p)) out = out.slice(0, -1) + p;
    else out += ` ${p}`;
  }
  return out;
}
