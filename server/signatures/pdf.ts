// PDFs for place_signature: where on which page a signature goes (beside words found on the page, or at a spot given
// as shares of the page), and the signed PDF, the page as a picture for the card, and a box where it would go for an
// agent to look at. Reading and writing PDFs is the PDF code's (server/documents/pdf/): its signed copy an incremental
// update that leaves what is there as it was (so digital signatures already in the file stay valid). pdfTools() below
// is where that code comes in; until it does, PDFs are not ready yet.
import type { PlaceSpot } from '../../shared/signatures.ts';

/** What placing a signature needs of the PDF code. Positions are in points, from the page's top-left corner. */
export interface PdfTools {
  /** Each page's size in points, as it shows (a turned page turned). */
  pages(pdf: Buffer): { w: number; h: number }[];
  /** The PDF with the picture drawn on a page, at and as large as `at` says: an incremental update of it. */
  stampImage(pdf: Buffer, at: PdfSpot, png: Buffer): Buffer;
  /** Where words are on the pages (or one page), as they read: each place's box. */
  findWords(pdf: Buffer, words: string, page?: number): PdfSpot[];
  /** A page as a picture (PNG). */
  pagePicture(pdf: Buffer, page: number): Promise<Buffer>;
}

export interface PdfSpot {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PDF_NOT_READY = 'PDFs are not ready yet.';

/** For the script tests: PDF code of their own. */
export const pdfHooks: { tools?: PdfTools } = {};

// STUB, wired to the PDF code (server/documents/pdf/) when it is merged: return its stampImage, findWords, pagePicture
// and pages here. Until then, placing a signature into a PDF answers that PDFs are not ready yet.
export async function pdfTools(): Promise<PdfTools> {
  if (pdfHooks.tools) return pdfHooks.tools;
  throw new Error(PDF_NOT_READY);
}

export type Side = 'right' | 'left' | 'above' | 'below';

const MM = 72 / 25.4;

/**
 * Where on which page: beside `near` (the words found, on `page` or any), or at `x`, `y` (shares of the page from its
 * top-left: the signature's left end and the line it sits on), `widthMm` wide. Throws, in words an agent can act on,
 * when the words are not found or nothing says where.
 */
export function pdfSpot(
  t: PdfTools,
  pdf: Buffer,
  px: { width: number; height: number },
  a: { page?: number; near?: string; side?: Side; x?: number; y?: number; occurrence?: number; widthMm: number },
): { at: PdfSpot; pages: number; where: string; spot: PlaceSpot } {
  const sizes = t.pages(pdf);
  const n = sizes.length;
  if (!n) throw new Error('This PDF has no pages');
  if (a.page !== undefined && (!Number.isInteger(a.page) || a.page < 1 || a.page > n)) throw new Error(`The PDF has ${n} page${n === 1 ? '' : 's'}: page is from 1 to ${n}`);
  const w = a.widthMm * MM;
  const h = (w * px.height) / Math.max(1, px.width);
  let page: number;
  let x: number;
  let y: number;
  let where: string;
  let spot: PlaceSpot;
  if (a.near) {
    const hits = t.findWords(pdf, a.near, a.page);
    if (!hits.length) throw new Error(`“${a.near}” was not found on ${a.page ? `page ${a.page}` : 'any page'}. A PDF’s words are read as well as they can be, and scanned pages have none: look at the page (look: true) and give x and y instead.`);
    const k = Math.trunc(Number(a.occurrence) || 1);
    const hit = hits[k < 0 ? hits.length + k : k - 1];
    if (!hit) throw new Error(`Those words are on the pages ${hits.length} times: occurrence is from 1 to ${hits.length} (or -1 for the last)`);
    page = hit.page;
    // Standing on the words' line (its tails a little below), or above or below the words.
    const base = hit.y + hit.h * 0.8;
    const side = a.side ?? 'right';
    if (side === 'right') ((x = hit.x + hit.w + 6), (y = base - h * 0.85));
    else if (side === 'left') ((x = hit.x - w - 6), (y = base - h * 0.85));
    else if (side === 'above') ((x = hit.x), (y = hit.y - h - 2));
    else ((x = hit.x), (y = hit.y + hit.h + 2));
    where = `page ${page} of ${n}, ${side === 'right' ? 'right after' : side === 'left' ? 'before' : side} “${a.near}”`;
    spot = { kind: 'words', words: a.near, how: side, ...(hits.length > 1 ? { nth: hits.indexOf(hit) + 1, of: hits.length } : {}) };
  } else if (typeof a.x === 'number' && typeof a.y === 'number') {
    page = a.page ?? n;
    const s = sizes[page - 1];
    x = Math.min(1, Math.max(0, a.x)) * s.w;
    y = Math.min(1, Math.max(0, a.y)) * s.h - h * 0.85;
    where = `page ${page} of ${n}, ${Math.round(a.x * 100)}% across and ${Math.round(a.y * 100)}% down`;
    spot = { kind: 'point', x: a.x, y: a.y };
  } else throw new Error('Say where on the page: near (words on it to sign beside), or x and y (look: true shows the page first).');
  const s = sizes[page - 1];
  // On the page, whole.
  x = Math.min(Math.max(0, x), Math.max(0, s.w - w));
  y = Math.min(Math.max(0, y), Math.max(0, s.h - h));
  return { at: { page, x, y, w, h }, pages: n, where, spot };
}
