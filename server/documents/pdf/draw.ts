// Writing on a PDF's pages, as an incremental update: text (in fonts that hold its words, Greek and Chinese too), ticks,
// crosses and dots, pictures (a signature among them), white boxes over what is there, outlines and lines, drawn into
// the page; highlights and comments as annotations that viewers list and can take away. Each mark goes at a point given
// in points from the page's top-left as it shows, or beside words found on the page ("right of 'Signature:'"). White
// boxes hide what they cover from the eye only: the words under them stay in the file (no true redaction).
import { circle } from './appearance.ts';
import { PageEdit, PageEdits } from './edits.ts';
import type { PdfFile } from './file.ts';
import { PdfError } from './file.ts';
import { flateStream } from './filters.ts';
import { FontBox, fontsFor } from './fontset.ts';
import { certified } from './forms.ts';
import { picture } from './images.ts';
import { dict, num, Ref, Str, textStr } from './objects.ts';
import { type Page, pages, userPoint, userRect } from './pages.ts';
import { findIn, type Found, findWordsIn, pageLines } from './text.ts';

export interface Near {
  /** Words printed on the page. */
  words: string;
  /** Which of them, when they are there more than once (from 1). */
  nth?: number;
  /** Where the mark goes: after them on their line (right, the default), before them, under them, over them, or on them. */
  side?: 'right' | 'left' | 'below' | 'above' | 'over';
  /** Points between them and the mark (default 4). */
  gap?: number;
}

interface At {
  page: number;
  x?: number;
  y?: number;
  near?: Near;
}

export type Mark =
  | (At & { type: 'text'; text: string; size?: number; color?: string; width?: number; align?: 'left' | 'center' | 'right' })
  | (At & { type: 'check' | 'cross' | 'dot'; size?: number; color?: string })
  | (At & { type: 'image'; data: Buffer; w?: number; h?: number })
  | (At & { type: 'whiteout'; w?: number; h?: number; color?: string })
  | (At & { type: 'rect'; w: number; h: number; color?: string; lineWidth?: number })
  | { type: 'line'; page: number; x1: number; y1: number; x2: number; y2: number; color?: string; lineWidth?: number }
  | (At & { type: 'highlight'; w?: number; h?: number; color?: string })
  | (At & { type: 'comment'; text: string; author?: string });

export interface Placed {
  type: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [1, 1, 1],
  red: [0.8, 0.1, 0.1],
  green: [0.1, 0.55, 0.2],
  blue: [0.1, 0.25, 0.75],
  navy: [0.05, 0.1, 0.4],
  gray: [0.45, 0.45, 0.45],
  grey: [0.45, 0.45, 0.45],
  yellow: [1, 0.92, 0.2],
  orange: [1, 0.6, 0.1],
  purple: [0.5, 0.2, 0.6],
};

/** A colour as "#rgb", "#rrggbb" or a name, as 0–1 values. */
export function rgb(c: string | undefined, d: [number, number, number]): [number, number, number] {
  if (!c) return d;
  const s = c.trim().toLowerCase();
  if (COLORS[s]) return COLORS[s];
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (!m) throw new PdfError(`"${c}" is not a colour: give #rrggbb or a name (black, blue, red, green, gray, yellow, white).`);
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const col = (c: [number, number, number], op: 'rg' | 'RG') => `${c.map((v) => num(Math.round(v * 1000) / 1000)).join(' ')} ${op}`;

/** Where the words are on the page (the nth time), or an error that says where else they are. */
function locate(pdf: PdfFile, p: Page, near: Near): Found {
  const found = findIn(pageLines(pdf, p), near.words, p.index);
  if (!found.length) {
    const elsewhere = [...new Set(findWordsIn(pdf, near.words).map((f) => f.page))];
    throw new PdfError(
      `"${near.words}" is not on page ${p.index}${elsewhere.length ? `; it is on page ${elsewhere.slice(0, 8).join(', ')}` : ' (nor elsewhere in the file: give x and y, or other words that are printed on it; a scanned page has no words to find)'}.`,
    );
  }
  const n = Math.round(near.nth ?? 1);
  if (n < 1 || n > found.length) throw new PdfError(`"${near.words}" is on page ${p.index} ${found.length} time${found.length === 1 ? '' : 's'}: nth goes from 1 to ${found.length}.`);
  return found[n - 1];
}

/** The top-left corner of a box w × h for a mark: as given, or beside the words (lined up with their baseline). */
function place(pdf: PdfFile, p: Page, m: At, w: number, h: number, baselineAt = 0.8): { x: number; y: number; found?: Found } {
  if (m.near) {
    const f = locate(pdf, p, m.near);
    const gap = m.near.gap ?? 4;
    // Their baseline: about four fifths down their box.
    const base = f.y + f.h * 0.78;
    const side = m.near.side ?? 'right';
    if (side === 'over') return { x: f.x, y: f.y, found: f };
    if (side === 'below') return { x: f.x, y: f.y + f.h + gap, found: f };
    if (side === 'above') return { x: f.x, y: f.y - gap - h, found: f };
    const y = base - h * baselineAt;
    return { x: side === 'left' ? f.x - gap - w : f.x + f.w + gap, y, found: f };
  }
  if (typeof m.x !== 'number' || typeof m.y !== 'number' || !Number.isFinite(m.x) || !Number.isFinite(m.y)) throw new PdfError('Give x and y (points from the page’s top-left), or near: { words } to put it beside words printed on the page.');
  if (m.x < -1 || m.y < -1 || m.x > p.width + 1 || m.y > p.height + 1) throw new PdfError(`x ${m.x}, y ${m.y} is off page ${p.index}, which is ${Math.round(p.width)} × ${Math.round(p.height)} points.`);
  return { x: m.x, y: m.y };
}

function pageOf(list: Page[], n: number): Page {
  const p = list[Math.round(n) - 1];
  if (!p) throw new PdfError(`There is no page ${n}: the file has ${list.length} page${list.length === 1 ? '' : 's'}.`);
  return p;
}

/** What may be changed: content needs the owner's leave to modify, annotations to comment; certified files say more. */
function allowed(pdf: PdfFile, content: boolean, annots: boolean) {
  const perms = pdf.permissions();
  if (perms && content && !perms.modify) throw new PdfError('The file’s owner protected it against changes to its pages (it is encrypted with permissions that do not allow it). Its form fields may still be filled, if it has any.');
  if (perms && annots && !perms.annotate) throw new PdfError('The file’s owner protected it against adding comments and highlights.');
  const mdp = certified(pdf);
  if (mdp === 1) throw new PdfError('The file is certified with a digital signature that allows no changes at all.');
  if (mdp === 2 && (content || annots)) throw new PdfError('The file is certified with a digital signature that allows only filling its form: writing on its pages would break that.');
  if (mdp === 3 && content) throw new PdfError('The file is certified with a digital signature that allows only filling its form and adding comments: writing on its pages would break that (a comment or highlight would not).');
}

const pdfDate = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

/** A transparency-capable file needs PDF 1.4: an older one says so in its catalog. */
function needs14(pdf: PdfFile) {
  if (Number(pdf.version) >= 1.4) return;
  const v = pdf.catalog().get('Version');
  if (typeof v === 'string' && Number(v) >= 1.4) return;
  const root = pdf.trailer.get('Root');
  if (root instanceof Ref) pdf.edit(root).set('Version', '1.4');
}

/** Draws the marks on their pages (changes made to `pdf`, to be saved with saveUpdate); where each went. */
export async function drawMarks(pdf: PdfFile, marks: Mark[]): Promise<{ placed: Placed[]; notes: string[] }> {
  if (!marks.length) throw new PdfError('Give at least one mark to write.');
  if (marks.length > 500) throw new PdfError('At most 500 marks at once.');
  const content = marks.some((m) => m.type !== 'highlight' && m.type !== 'comment');
  const annots = marks.some((m) => m.type === 'highlight' || m.type === 'comment');
  allowed(pdf, content, annots);
  const list = pages(pdf);
  const text = marks.map((m) => (m.type === 'text' ? m.text : '')).join('\n');
  const fonts = text.trim() ? new FontBox(pdf, await fontsFor(text)) : null;
  const edits = new PageEdits(pdf);
  const placed: Placed[] = [];
  const notes: string[] = [];
  for (const m of marks) {
    const p = pageOf(list, m.page);
    const e = edits.page(p);
    const H = p.height;
    if (m.type === 'text') {
      if (!m.text) throw new PdfError('A text mark needs its text.');
      const size = Math.max(2, Math.min(200, m.size ?? 11));
      const { ascent, descent } = fonts!.metrics();
      const lh = size * 1.2;
      const lines = m.width ? m.text.split('\n').flatMap((l) => wrapWords(fonts!, l, size, m.width!)) : m.text.split('\n');
      const widths = lines.map((l) => fonts!.measure(l, size));
      const w = m.width ?? Math.max(...widths);
      const h = lh * (lines.length - 1) + ((ascent - descent) / 1000) * size;
      // Beside words, the first line's baseline goes on theirs.
      const at = place(pdf, p, m, w, h, lines.length > 1 ? ((ascent / 1000) * size) / h : ascent / (ascent - descent));
      const out = ['BT', col(rgb(m.color, [0, 0, 0]), 'rg')];
      lines.forEach((line, i) => {
        if (!line) return;
        const lw = widths[i];
        const x = m.align === 'center' ? at.x + (w - lw) / 2 : m.align === 'right' ? at.x + w - lw : at.x;
        const base = at.y + (ascent / 1000) * size + i * lh;
        out.push(
          `1 0 0 1 ${num(x)} ${num(H - base)} Tm ${fonts!
            .runs(line)
            .map((r) => `/${e.resource('Font', r.font.ref, r.res)} ${num(size)} Tf <${r.bytes.toString('hex')}> Tj`)
            .join(' ')}`,
        );
      });
      out.push('ET');
      e.ops.push(out.join(' '));
      placed.push({ type: 'text', page: p.index, x: at.x, y: at.y, w, h });
    } else if (m.type === 'check' || m.type === 'cross' || m.type === 'dot') {
      const s = Math.max(4, Math.min(100, m.size ?? 12));
      const at = place(pdf, p, m, s, s, 0.85);
      const c = rgb(m.color, [0, 0, 0]);
      const y = H - at.y - s;
      const pt = (fx: number, fy: number) => `${num(at.x + fx * s)} ${num(y + fy * s)}`;
      if (m.type === 'check') e.ops.push(`q ${col(c, 'RG')} ${num(s * 0.12)} w 1 J 1 j ${pt(0.12, 0.5)} m ${pt(0.4, 0.2)} l ${pt(0.9, 0.85)} l S Q`);
      else if (m.type === 'cross') e.ops.push(`q ${col(c, 'RG')} ${num(s * 0.11)} w 1 J ${pt(0.15, 0.15)} m ${pt(0.85, 0.85)} l ${pt(0.15, 0.85)} m ${pt(0.85, 0.15)} l S Q`);
      else e.ops.push(`q ${col(c, 'rg')} ${circle(at.x + s / 2, y + s / 2, s * 0.3)} f Q`);
      placed.push({ type: m.type, page: p.index, x: at.x, y: at.y, w: s, h: s });
    } else if (m.type === 'image') {
      const pic = picture(m.data);
      let w = m.w;
      let h = m.h;
      if (!w && !h) w = Math.min(150, p.width / 3);
      if (w && !h) h = (w * pic.height) / pic.width;
      if (h && !w) w = (h * pic.width) / pic.height;
      // Both given: the picture fits inside, its shape kept, in the middle.
      let ww = w!;
      let hh = h!;
      if (m.w && m.h) {
        const k = Math.min(m.w / pic.width, m.h / pic.height);
        ww = pic.width * k;
        hh = pic.height * k;
      }
      const at = place(pdf, p, m, ww, hh, 0.85);
      const ox = m.w && m.h && !m.near ? (m.w - ww) / 2 : 0;
      const oy = m.w && m.h && !m.near ? (m.h - hh) / 2 : 0;
      const ref = pic.write((o) => pdf.add(o));
      const name = e.resource('XObject', ref);
      e.ops.push(`q ${num(ww)} 0 0 ${num(hh)} ${num(at.x + ox)} ${num(H - at.y - oy - hh)} cm /${name} Do Q`);
      needs14(pdf);
      placed.push({ type: 'image', page: p.index, x: at.x + ox, y: at.y + oy, w: ww, h: hh });
    } else if (m.type === 'whiteout' || m.type === 'rect') {
      let w = m.w ?? 0;
      let h = m.h ?? 0;
      let at: { x: number; y: number };
      if (m.near && m.type === 'whiteout' && (m.near.side ?? 'over') === 'over') {
        // Over the words: their box with a little room.
        const f = locate(pdf, p, m.near);
        const pad = m.near.gap ?? 1.5;
        at = { x: f.x - pad, y: f.y - pad };
        w = m.w ?? f.w + 2 * pad;
        h = m.h ?? f.h + 2 * pad;
      } else {
        if (!(w > 0 && h > 0)) throw new PdfError(`A ${m.type === 'rect' ? 'box' : 'white-out'} needs its width and height (w, h).`);
        at = place(pdf, p, m, w, h, 0.8);
      }
      if (m.type === 'whiteout') e.ops.push(`q ${col(rgb(m.color, [1, 1, 1]), 'rg')} ${num(at.x)} ${num(H - at.y - h)} ${num(w)} ${num(h)} re f Q`);
      else {
        const lw = Math.max(0.25, Math.min(20, m.lineWidth ?? 1));
        e.ops.push(`q ${col(rgb(m.color, [0, 0, 0]), 'RG')} ${num(lw)} w ${num(at.x)} ${num(H - at.y - h)} ${num(w)} ${num(h)} re S Q`);
      }
      placed.push({ type: m.type, page: p.index, x: at.x, y: at.y, w, h });
    } else if (m.type === 'line') {
      for (const v of [m.x1, m.y1, m.x2, m.y2]) if (typeof v !== 'number' || !Number.isFinite(v)) throw new PdfError('A line needs x1, y1, x2 and y2 (points from the page’s top-left).');
      const lw = Math.max(0.25, Math.min(20, m.lineWidth ?? 1));
      e.ops.push(`q ${col(rgb(m.color, [0, 0, 0]), 'RG')} ${num(lw)} w 1 J ${num(m.x1)} ${num(H - m.y1)} m ${num(m.x2)} ${num(H - m.y2)} l S Q`);
      placed.push({ type: 'line', page: p.index, x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) });
    } else if (m.type === 'highlight') {
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      if (m.near) {
        const all = findIn(pageLines(pdf, p), m.near.words, p.index);
        if (!all.length) locate(pdf, p, m.near);
        boxes.push(...(m.near.nth ? [locate(pdf, p, m.near)] : all));
      } else {
        if (!(m.w! > 0 && m.h! > 0)) throw new PdfError('A highlight needs near: { words } (the words to highlight), or x, y, w and h.');
        const at = place(pdf, p, m, m.w!, m.h!);
        boxes.push({ x: at.x, y: at.y, w: m.w!, h: m.h! });
      }
      const c = rgb(m.color, [1, 0.92, 0.2]);
      for (const b of boxes) {
        addHighlight(pdf, e, p, b, c);
        placed.push({ type: 'highlight', page: p.index, ...b });
      }
    } else if (m.type === 'comment') {
      if (!m.text) throw new PdfError('A comment needs its text.');
      const at = place(pdf, p, m, 20, 20, 0.8);
      addNote(pdf, e, p, at, m.text, m.author ?? 'Hydor');
      placed.push({ type: 'comment', page: p.index, x: at.x, y: at.y, w: 20, h: 20 });
    } else throw new PdfError(`Unknown mark type "${(m as { type: string }).type}": text, check, cross, dot, image, whiteout, rect, line, highlight or comment.`);
  }
  edits.finish();
  fonts?.finish();
  if (pdf.signed() && content) notes.push('The file has a digital signature: viewers will show that it was changed after signing (the signed version is still inside it).');
  if (marks.some((m) => m.type === 'whiteout')) notes.push('White boxes hide what they cover only from the eye: the words under them are still in the file and can be copied out. Nothing was redacted.');
  return { placed, notes };
}

/** Lines of words that fit `width` at `size`. */
function wrapWords(fonts: FontBox, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/(\s+)/)) {
    if (fonts.measure((line + word).trimEnd(), size) > width && line.trim()) {
      out.push(line.trimEnd());
      line = word.trimStart();
    } else line += word;
  }
  out.push(line.trimEnd());
  return out;
}

/** A highlight annotation over a box (points from the top-left), with its own appearance so every viewer shows it. */
function addHighlight(pdf: PdfFile, e: PageEdit, p: Page, b: { x: number; y: number; w: number; h: number }, c: [number, number, number]) {
  const ul = userPoint(p, b.x, b.y);
  const ur = userPoint(p, b.x + b.w, b.y);
  const ll = userPoint(p, b.x, b.y + b.h);
  const lr = userPoint(p, b.x + b.w, b.y + b.h);
  const rect = userRect(p, b.x, b.y, b.w, b.h);
  const gs = dict({ Type: 'ExtGState', BM: 'Multiply', CA: 1, ca: 1 });
  const ap = pdf.add(
    flateStream(
      Buffer.from(`/GS0 gs ${col(c, 'rg')} ${num(ul[0])} ${num(ul[1])} m ${num(ur[0])} ${num(ur[1])} l ${num(lr[0])} ${num(lr[1])} l ${num(ll[0])} ${num(ll[1])} l h f`, 'latin1'),
      dict({ Type: 'XObject', Subtype: 'Form', BBox: rect, Resources: dict({ ExtGState: dict({ GS0: gs }) }) }),
    ),
  );
  const a = pdf.add(
    dict({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: rect,
      QuadPoints: [ul[0], ul[1], ur[0], ur[1], ll[0], ll[1], lr[0], lr[1]],
      C: c,
      F: 4,
      P: p.ref,
      M: new Str(Buffer.from(pdfDate())),
      AP: dict({ N: ap }),
    }),
  );
  e.annots.push(a);
}

/** A comment (a sticky note): its text, who wrote it, and a small note's picture at the point. */
function addNote(pdf: PdfFile, e: PageEdit, p: Page, at: { x: number; y: number }, text: string, author: string) {
  const rect = userRect(p, at.x, at.y, 20, 20);
  const ap = pdf.add(
    flateStream(
      Buffer.from('q 1 0.85 0.3 rg 0.45 0.35 0.1 RG 1 w 1 1 18 18 re B 0.45 0.35 0.1 RG 0.8 w 4 14 m 16 14 l 4 10 m 16 10 l 4 6 m 12 6 l S Q', 'latin1'),
      dict({ Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 20, 20], Matrix: [1, 0, 0, 1, 0, 0] }),
    ),
  );
  const a = pdf.add(
    dict({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: rect,
      Contents: textStr(text),
      T: textStr(author),
      Name: 'Comment',
      C: [1, 0.85, 0.3],
      // Printed, and the same size whatever the zoom or rotation.
      F: 28,
      P: p.ref,
      M: new Str(Buffer.from(pdfDate())),
      CreationDate: new Str(Buffer.from(pdfDate())),
      AP: dict({ N: ap }),
    }),
  );
  e.annots.push(a);
}

/**
 * A picture placed on a page as an incremental update: `at` in points from the page's top-left (page from 1), the
 * picture fitted inside that box with its shape kept and its transparency (a PNG's alpha) as a soft mask.
 */
export function stampOn(pdf: PdfFile, at: { page: number; x: number; y: number; w: number; h: number }, image: Buffer) {
  allowed(pdf, true, false);
  const p = pageOf(pages(pdf), at.page);
  if (!(at.w > 0 && at.h > 0)) throw new PdfError('The picture’s box needs a width and a height (w, h) above 0.');
  const edits = new PageEdits(pdf);
  const e = edits.page(p);
  const pic = picture(image);
  const k = Math.min(at.w / pic.width, at.h / pic.height);
  const w = pic.width * k;
  const h = pic.height * k;
  const x = at.x + (at.w - w) / 2;
  const y = at.y + (at.h - h) / 2;
  const name = e.resource(
    'XObject',
    pic.write((o) => pdf.add(o)),
  );
  e.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(p.height - y - h)} cm /${name} Do Q`);
  needs14(pdf);
  edits.finish();
}
