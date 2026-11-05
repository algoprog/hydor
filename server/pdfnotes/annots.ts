// A PDF's highlights in the file itself, and pictures for the reader: Save into the PDF writes each highlight as the
// PDF's own annotation (words: a Highlight over each of their lines; an area: a Square around it), its note as the
// annotation's comment, named "hydor:<id>" so saving again puts the notes as they are now in place of the last ones;
// other apps list them and can change them. The reader shows the app's own highlights over the pages, so a file that
// keeps notes here is drawn without the ones saved into it (else they would show twice); and a part of a page (an area
// picked around a figure or an equation) is drawn alone, as the page cut to that box.
import { PageEdits, type PageEdit } from '../documents/pdf/edits.ts';
import { PdfError, PdfFile } from '../documents/pdf/file.ts';
import { flateStream } from '../documents/pdf/filters.ts';
import { certified } from '../documents/pdf/forms.ts';
import { dict, isRef, isStr, num, type Obj, type Ref, Str, textStr } from '../documents/pdf/objects.ts';
import { type Page, pages, userPoint, userRect } from '../documents/pdf/pages.ts';
import { HIGHLIGHT_RGB, type PdfHighlight, type PdfRect } from '../../shared/pdfnotes.ts';

const PREFIX = 'hydor:';

/** Whether an annotation is one the app wrote (its name says so). */
function isOurs(pdf: PdfFile, a: Obj): boolean {
  const nm = pdf.dictOf(a)?.get('NM');
  const s = isStr(nm) ? nm : pdf.resolve(nm ?? null);
  return isStr(s) && s.text().startsWith(PREFIX);
}

/** The app's own annotations on a page. */
function oursOn(pdf: PdfFile, p: Page): Obj[] {
  return pdf.arrayOf(pdf.dictOf(p.ref)?.get('Annots') ?? p.dict.get('Annots') ?? null).filter((a) => isOurs(pdf, a));
}

/** Whether the file may hold the app's own annotations: their names show in its bytes, unless it is encrypted. */
const mayHold = (data: Buffer) => data.includes(PREFIX) || data.includes('/Encrypt');

/** Whether the file has highlights the app saved into it. */
export function hasOurs(data: Buffer): boolean {
  if (!mayHold(data)) return false;
  const pdf = new PdfFile(data);
  return pages(pdf).some((p) => oursOn(pdf, p).length > 0);
}

const pdfDate = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

const rgb = (h: PdfHighlight) => HIGHLIGHT_RGB[h.color].map((v) => Math.round((v / 255) * 1000) / 1000);

/** A Highlight over each line of words, as one annotation: its quads, a look of its own (multiplied, so the words show), its note. */
function addText(pdf: PdfFile, e: PageEdit, p: Page, h: PdfHighlight, author: string, when: Str) {
  const quads: number[] = [];
  const paths: string[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of h.rects) {
    // A little above and below the words, as markers are.
    const b = { x: r.x, y: r.y - r.h * 0.08, w: r.w, h: r.h * 1.16 };
    const ul = userPoint(p, b.x, b.y);
    const ur = userPoint(p, b.x + b.w, b.y);
    const ll = userPoint(p, b.x, b.y + b.h);
    const lr = userPoint(p, b.x + b.w, b.y + b.h);
    quads.push(...ul, ...ur, ...ll, ...lr);
    paths.push(`${num(ul[0])} ${num(ul[1])} m ${num(ur[0])} ${num(ur[1])} l ${num(lr[0])} ${num(lr[1])} l ${num(ll[0])} ${num(ll[1])} l h`);
    for (const [x, y] of [ul, ur, ll, lr]) ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)));
  }
  if (!quads.length) return;
  const rect = [x0, y0, x1, y1].map((v) => Math.round(v * 100) / 100);
  const c = rgb(h);
  const ap = pdf.add(
    flateStream(
      Buffer.from(`/GS0 gs ${c.map(num).join(' ')} rg ${paths.join(' ')} f`, 'latin1'),
      dict({ Type: 'XObject', Subtype: 'Form', BBox: rect, Resources: dict({ ExtGState: dict({ GS0: dict({ Type: 'ExtGState', BM: 'Multiply', CA: 1, ca: 1 }) }) }) }),
    ),
  );
  e.annots.push(
    pdf.add(
      dict({
        Type: 'Annot',
        Subtype: 'Highlight',
        Rect: rect,
        QuadPoints: quads.map((v) => Math.round(v * 100) / 100),
        C: c,
        F: 4,
        P: p.ref,
        NM: textStr(PREFIX + h.id),
        T: textStr(author),
        M: when,
        CreationDate: when,
        Contents: h.note?.trim() ? textStr(h.note.trim()) : undefined,
        AP: dict({ N: ap }),
      }),
    ),
  );
}

/** A Square around an area (a figure, an equation), outlined in its colour, with its note. */
function addArea(pdf: PdfFile, e: PageEdit, p: Page, h: PdfHighlight, author: string, when: Str) {
  const r = h.rects[0];
  if (!r) return;
  const rect = userRect(p, r.x, r.y, r.w, r.h).map((v) => Math.round(v * 100) / 100);
  // The outline a shade darker than the marker, so it shows on white.
  const c = rgb(h).map((v) => Math.round(v * 0.75 * 1000) / 1000);
  const w = 1.5;
  const ap = pdf.add(
    flateStream(
      Buffer.from(`${c.map(num).join(' ')} RG ${num(w)} w ${num(rect[0] + w / 2)} ${num(rect[1] + w / 2)} ${num(rect[2] - rect[0] - w)} ${num(rect[3] - rect[1] - w)} re S`, 'latin1'),
      dict({ Type: 'XObject', Subtype: 'Form', BBox: rect }),
    ),
  );
  e.annots.push(
    pdf.add(
      dict({
        Type: 'Annot',
        Subtype: 'Square',
        Rect: rect,
        C: c,
        BS: dict({ W: w, S: 'S' }),
        F: 4,
        P: p.ref,
        NM: textStr(PREFIX + h.id),
        T: textStr(author),
        M: when,
        CreationDate: when,
        Contents: h.note?.trim() ? textStr(h.note.trim()) : h.text ? textStr(h.text) : undefined,
        AP: dict({ N: ap }),
      }),
    ),
  );
}

/**
 * The PDF with the highlights as its own annotations, as an incremental update (what was in it stays byte for byte):
 * the app's earlier ones taken off, these put on. Refused where the file's owner or a certifying signature forbids
 * comments.
 */
export function writeHighlights(data: Buffer, hs: PdfHighlight[], author = 'Hydor'): { data: Buffer; count: number; notes: string[] } {
  const pdf = new PdfFile(data);
  const perms = pdf.permissions();
  if (perms && !perms.annotate) throw new PdfError('The file’s owner protected it against adding comments and highlights, so they can’t be saved into it. They stay here, beside it.');
  const mdp = certified(pdf);
  if (mdp === 1 || mdp === 2) throw new PdfError('The file is certified with a digital signature that allows no comments, so the highlights can’t be saved into it. They stay here, beside it.');
  const list = pages(pdf);
  const edits = new PageEdits(pdf);
  for (const p of list) for (const a of oursOn(pdf, p)) if (isRef(a)) edits.page(p).remove.add((a as Ref).num);
  const when = new Str(Buffer.from(pdfDate()));
  let count = 0;
  for (const h of hs) {
    const p = list[h.page - 1];
    if (!p || !h.rects.length) continue;
    const e = edits.page(p);
    if (h.kind === 'area') addArea(pdf, e, p, h, author, when);
    else addText(pdf, e, p, h, author, when);
    count++;
  }
  edits.finish();
  const notes: string[] = [];
  if (pdf.signed()) notes.push('The file has a digital signature: other viewers show the highlights as comments added after signing (what was signed stays valid).');
  return { data: pdf.changed ? pdf.saveUpdate() : data, count, notes };
}

/** The file with the app's own highlights taken off a page (in memory, for a picture of the page under the reader's). */
export function withoutOurs(data: Buffer, page: number): Buffer {
  if (!mayHold(data)) return data;
  const pdf = new PdfFile(data);
  const p = pages(pdf)[page - 1];
  if (!p) return data;
  const annots = pdf.arrayOf(p.dict.get('Annots') ?? null);
  const keep = annots.filter((a) => !isOurs(pdf, a));
  if (keep.length === annots.length) return data;
  const d = pdf.edit(p.ref);
  if (keep.length) d.set('Annots', keep);
  else d.delete('Annots');
  return pdf.saveUpdate();
}

/** The file with a page cut to a box (in memory): drawn, it is a picture of that part of the page alone. */
export function cutTo(data: Buffer, page: number, box: PdfRect, dropOurs: boolean): Buffer {
  const src = dropOurs ? withoutOurs(data, page) : data;
  const pdf = new PdfFile(src);
  const p = pages(pdf)[page - 1];
  if (!p) throw new PdfError(`There is no page ${page}.`);
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const w = Math.min(p.width - x, box.w - (x - box.x));
  const h = Math.min(p.height - y, box.h - (y - box.y));
  if (!(w > 1 && h > 1)) throw new PdfError('That part is off the page.');
  const r = userRect(p, x, y, w, h);
  const d = pdf.edit(p.ref);
  d.set('MediaBox', r);
  d.set('CropBox', r);
  d.delete('BleedBox');
  d.delete('TrimBox');
  d.delete('ArtBox');
  return pdf.saveUpdate();
}
