// A PDF's pages: the page tree walked in order (with what pages inherit from their parents: resources, boxes and
// rotation), each page's size as it shows, and the arithmetic between the two ways of saying where something is on a
// page. People and agents give places in points from the page's top-left corner as it shows (rotated, cut to its crop
// box); the PDF itself draws in its user space, from the bottom-left of the unrotated media box.
import type { PdfFile } from './file.ts';
import { Dict, isDict, isRef, type Obj, Ref } from './objects.ts';

/** [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 then m2. */
export function mul(m1: Matrix, m2: Matrix): Matrix {
  return [m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3], m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3], m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5]];
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Page {
  /** From 1. */
  index: number;
  ref: Ref;
  dict: Dict;
  /** The page's resources, inherited from its parents when it has none of its own. */
  resources: Dict;
  media: Box;
  /** The crop box, within the media box: what shows. */
  crop: Box;
  /** 0, 90, 180 or 270, clockwise. */
  rotate: number;
  /** Its size as it shows, in points. */
  width: number;
  height: number;
  /** From display space (points, from the bottom-left of the page as it shows) to the page's user space. */
  toUser: Matrix;
}

function box(o: Obj, pdf: PdfFile): Box | null {
  const a = pdf.arrayOf(o).map((x) => pdf.numOf(x, NaN));
  if (a.length < 4 || a.some((n) => !Number.isFinite(n))) return null;
  return { x0: Math.min(a[0], a[2]), y0: Math.min(a[1], a[3]), x1: Math.max(a[0], a[2]), y1: Math.max(a[1], a[3]) };
}

const INHERITED = ['Resources', 'MediaBox', 'CropBox', 'Rotate'];

/** Every page, in order: a tree walked once, cycles and stray nodes skipped. */
export function pages(pdf: PdfFile): Page[] {
  const out: Page[] = [];
  const root = pdf.catalog().get('Pages');
  const seen = new Set<number>();
  const walk = (node: Obj, inherited: Map<string, Obj>, depth: number) => {
    if (!isRef(node) || seen.has(node.num) || depth > 64 || out.length > 100_000) return;
    seen.add(node.num);
    const d = pdf.dictOf(node);
    if (!d) return;
    const inh = new Map(inherited);
    for (const k of INHERITED) if (d.has(k)) inh.set(k, d.get(k)!);
    const kids = pdf.resolve(d.get('Kids'));
    const type = d.get('Type');
    if (type === 'Pages' || (type !== 'Page' && Array.isArray(kids))) {
      for (const k of Array.isArray(kids) ? kids : []) walk(k, inh, depth + 1);
      return;
    }
    out.push(makePage(pdf, out.length + 1, node, d, inh));
  };
  walk(root ?? null, new Map(), 0);
  return out;
}

function makePage(pdf: PdfFile, index: number, ref: Ref, d: Dict, inh: Map<string, Obj>): Page {
  const media = box(inh.get('MediaBox') ?? null, pdf) ?? { x0: 0, y0: 0, x1: 612, y1: 792 };
  let crop = box(inh.get('CropBox') ?? null, pdf) ?? media;
  crop = { x0: Math.max(crop.x0, media.x0), y0: Math.max(crop.y0, media.y0), x1: Math.min(crop.x1, media.x1), y1: Math.min(crop.y1, media.y1) };
  if (crop.x1 - crop.x0 < 1 || crop.y1 - crop.y0 < 1) crop = media;
  const rotate = ((((Math.round(pdf.numOf(inh.get('Rotate'), 0) / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const cw = crop.x1 - crop.x0;
  const ch = crop.y1 - crop.y0;
  const sideways = rotate === 90 || rotate === 270;
  const toUser: Matrix = rotate === 0 ? [1, 0, 0, 1, crop.x0, crop.y0] : rotate === 90 ? [0, 1, -1, 0, crop.x1, crop.y0] : rotate === 180 ? [-1, 0, 0, -1, crop.x1, crop.y1] : [0, -1, 1, 0, crop.x0, crop.y1];
  const res = pdf.dictOf(inh.get('Resources') ?? null) ?? new Dict();
  return { index, ref, dict: d, resources: res, media, crop, rotate, width: sideways ? ch : cw, height: sideways ? cw : ch, toUser };
}

/** A point given from the page's top-left as it shows, in its user space. */
export function userPoint(p: Page, x: number, y: number): [number, number] {
  return apply(p.toUser, x, p.height - y);
}

/** A point in user space, from the page's top-left as it shows. */
export function shownPoint(p: Page, ux: number, uy: number): [number, number] {
  const [dx, dy] = apply(invert(p.toUser), ux, uy);
  return [dx, p.height - dy];
}

/** A rectangle given from the top-left as it shows, as a user-space rectangle [x0 y0 x1 y1]. */
export function userRect(p: Page, x: number, y: number, w: number, h: number): [number, number, number, number] {
  const a = userPoint(p, x, y);
  const b = userPoint(p, x + w, y + h);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/** A user-space rectangle as it shows: from the top-left, with its width and height. */
export function shownRect(p: Page, r: number[]): { x: number; y: number; w: number; h: number } {
  const a = shownPoint(p, r[0], r[1]);
  const b = shownPoint(p, r[2], r[3]);
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return { x, y, w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

/** The page a widget or annotation is on: by its /P, else by the page whose /Annots lists it. */
export function pageIndexOf(pdf: PdfFile, list: Page[], annot: Ref | Dict): number {
  const d = annot instanceof Ref ? pdf.dictOf(annot) : annot;
  const p = d?.get('P');
  if (isRef(p)) {
    const hit = list.find((pg) => pg.ref.num === p.num);
    if (hit) return hit.index;
  }
  for (const pg of list) {
    for (const a of pdf.arrayOf(pg.dict.get('Annots'))) {
      if (annot instanceof Ref ? isRef(a) && a.num === annot.num : pdf.resolve(a) === annot) return pg.index;
    }
  }
  return 0;
}

export { isDict };
