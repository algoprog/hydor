// Hydor's own PDF code, for agents' tools, Files' Fill & sign and the signatures: what a PDF is (pages, form,
// encryption, signatures), its words and where they are, its form filled, words and marks written on its pages, its
// pages changed, and pictures of its pages. Everything that changes a file returns its new bytes: as an incremental
// update (what was there stays byte for byte, so a signature made before stays valid for what it signed), or, for page
// operations, as a whole new file.
//
// For the signatures: stampImage, findWords and pagePicture, as below.
import { type Mark, drawMarks, type Placed, stampOn } from './draw.ts';
import { editPages, extractPages, type PageOp, splitPdf } from './edit.ts';
import { PdfError, PdfFile } from './file.ts';
import { certified, type FillOptions, type FillValue, type Form, fillForm, FormError, readForm } from './forms.ts';
import { Str } from './objects.ts';
import { pages } from './pages.ts';
import { renderPage } from './render.ts';
import { type Found, findWordsIn, type Line, pageLines } from './text.ts';
import type { Permissions } from './crypt.ts';

export { PdfError, FormError, editPages, extractPages, splitPdf };
export type { Mark, Placed, PageOp, FillValue, Form, Found, Line };

/**
 * The PDF with a picture placed on a page, as an incremental update: `at` in points from the page's top-left corner
 * as it shows (page from 1); the picture (PNG or JPEG) fitted inside that box with its shape kept, a PNG's
 * transparency kept as a soft mask.
 */
export function stampImage(pdf: Buffer, at: { page: number; x: number; y: number; w: number; h: number }, png: Buffer): Buffer {
  const f = new PdfFile(pdf);
  stampOn(f, at, png);
  return f.saveUpdate();
}

/** Where `words` are printed (on one page, from 1, or on all): boxes in points from each page's top-left. */
export function findWords(pdf: Buffer, words: string, page?: number): { page: number; x: number; y: number; w: number; h: number }[] {
  const f = new PdfFile(pdf);
  return findWordsIn(f, words, page).map((b) => ({ page: b.page, x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }));
}

/**
 * A PNG of a page (from 1), 1200 pixels wide unless `o.width` says; `o.fields: false` leaves the form's fields out
 * of the picture (Fill & sign draws its own over it).
 */
export async function pagePicture(pdf: Buffer, page: number, o: { width?: number; fields?: boolean } = {}): Promise<Buffer> {
  const f = new PdfFile(pdf);
  const count = pages(f).length;
  if (!Number.isInteger(page) || page < 1 || page > count) throw new PdfError(`There is no page ${page}: the file has ${count} page${count === 1 ? '' : 's'}.`);
  const src = o.fields === false ? withoutFields(f, page) : pdf;
  return renderPage(src, page, { width: o.width }, () => extractPages(src, [page]).data);
}

/** The file with one page's form fields taken off it (in memory, for a picture of the page under them). */
function withoutFields(f: PdfFile, page: number): Buffer {
  const p = pages(f)[page - 1];
  const annots = f.arrayOf(p.dict.get('Annots') ?? null);
  const keep = annots.filter((a) => f.dictOf(a)?.get('Subtype') !== 'Widget');
  if (keep.length === annots.length) return f.buf;
  const d = f.edit(p.ref);
  d.set('Annots', keep);
  return f.saveUpdate();
}

const round = (n: number) => Math.round(n * 10) / 10;

export interface PdfInfo {
  pages: { width: number; height: number; rotate: number }[];
  encrypted: boolean;
  permissions: Permissions | null;
  /** A digital signature is in the file. */
  signed: boolean;
  /** A certifying signature's permission: 1 no changes, 2 form filling, 3 also comments. */
  certified: number | null;
  form: Form;
  /** Its cross-references were broken and rebuilt. */
  repaired: boolean;
  title?: string;
}

/** What a PDF is: its pages' sizes, encryption, signatures and form. */
export function pdfInfo(pdf: Buffer): PdfInfo {
  const f = new PdfFile(pdf);
  const info = f.dictOf(f.trailer.get('Info') ?? null);
  const t = f.resolve(info?.get('Title') ?? null);
  const title = t instanceof Str ? t.text().trim() : '';
  const form = readForm(f);
  return {
    pages: pages(f).map((p) => ({ width: round(p.width), height: round(p.height), rotate: p.rotate })),
    encrypted: !!f.crypt,
    permissions: f.permissions(),
    signed: f.signed() || form.fields.some((x) => x.kind === 'signature' && x.signed),
    certified: certified(f),
    form,
    repaired: f.repaired,
    ...(title ? { title } : {}),
  };
}

/** A page's lines of text with where they are (points from its top-left). */
export function pageText(pdf: Buffer, page: number): Line[] {
  const f = new PdfFile(pdf);
  const p = pages(f)[page - 1];
  if (!p) throw new PdfError(`There is no page ${page}.`);
  return pageLines(f, p);
}

/** The PDF with its form filled (and flattened when asked), as an incremental update. */
export async function fillPdf(pdf: Buffer, values: Record<string, FillValue>, o: FillOptions = {}): Promise<{ data: Buffer; filled: string[]; notes: string[] }> {
  const f = new PdfFile(pdf);
  const r = await fillForm(f, values, o);
  return { data: f.saveUpdate(), ...r };
}

/** The PDF with marks written on its pages, as an incremental update. */
export async function writeOnPdf(pdf: Buffer, marks: Mark[]): Promise<{ data: Buffer; placed: Placed[]; notes: string[] }> {
  const f = new PdfFile(pdf);
  const r = await drawMarks(f, marks);
  return { data: f.saveUpdate(), ...r };
}

/**
 * Fill & sign in one update: the form's values, then marks on the pages (text boxes, ticks, signatures), as the user
 * placed them in Files.
 */
export async function fillAndMark(pdf: Buffer, values: Record<string, FillValue>, marks: Mark[], o: FillOptions = {}): Promise<{ data: Buffer; notes: string[] }> {
  const f = new PdfFile(pdf);
  const notes: string[] = [];
  if (Object.keys(values).length) notes.push(...(await fillForm(f, values, o)).notes);
  if (marks.length) notes.push(...(await drawMarks(f, marks)).notes);
  return { data: f.changed ? f.saveUpdate() : pdf, notes: [...new Set(notes)] };
}
