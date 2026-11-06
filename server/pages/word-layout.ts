// How the documents editor lays a document out (shared/docs.ts docCss: the editor's pages and the PDF alike), in points,
// for its Word file, so Word's pages break where the editor's do: each block's font size and line height, the space
// the editor puts above and below it, and Word's way of saying the same. The editor's spaces are CSS margins, which
// collapse (two blocks stand as far apart as the larger of the two asks), and so do Word's space before and after
// (since Word 2000, unless "Don't use HTML paragraph auto spacing" is set): a block's margins are its spaces, but where
// padding the editor keeps inside a block (a line across, a table of contents) or a table (which has none of its own
// in Word) comes between. Lines are given in points: Word lays a font's single line out with its Windows metrics, often
// far taller than a browser's (Merriweather's 1.73 of its size against 1.26), so a multiple of Word's line would not
// be the editor's line. docs.ts writes Word files with this, and reads them back with it (what spacing is a block's
// own, what the layout's).
import { cssLine, STYLES, styleOf, type Block, type Doc } from '../../shared/docs.ts';
import { wordLine } from './word-fonts.ts';

/** One step of indent (paragraphs, list levels), in points (the editor's --nd-step). */
export const STEP = 36;
/** A list item's words start this far (in its ems) after its mark's place. */
export const LIST_TEXT = 1.6;
/** Table cells: their padding (ems, top and bottom, then left and right) and line height. */
export const CELL = { v: 0.35, h: 0.55, line: 1.35 };
/** A picture's caption: its size (of the document's), line height, and space above it (its ems). */
export const CAPTION = { k: 0.88, line: 1.35, before: 0.45 };
/** A table of contents' lines: the space above and below each (ems). */
export const TOC_PAD = 0.14;

/** What the editor gives a block, in points: its font size, its lines' height, its margins (which collapse) and the space inside them that does not. */
export interface Box {
  size: number;
  line: number;
  mt: number;
  mb: number;
  /** Space inside the block above and below what it holds (paddings Word says as space before and after). */
  pt: number;
  pb: number;
}

/**
 * A block's box, after `prev` (a list item before another kind of block puts it .6 of its em below), at the top of
 * its page or not (the editor puts the first block on a page at the page's top, its space above dropped). A paragraph's
 * own spacing takes the place of its style's.
 */
export function boxOf(doc: Doc, b: Block, prev: Block | undefined, top: boolean): Box {
  const S = doc.size;
  const box: Box = { size: S, line: STYLES.normal.lh * S, mt: 0, mb: STYLES.normal.after * S, pt: 0, pb: 0 };
  if (b.type === 'p') {
    const st = styleOf(doc, b.style ?? 'normal');
    box.size = S * st.k;
    box.line = st.lh * box.size;
    box.mt = st.before * box.size;
    box.mb = st.after * box.size;
  } else if (b.type === 'li') box.mb = 0.25 * S;
  else if (b.type === 'table') Object.assign(box, { line: CELL.line * S, mt: 0.3 * S, mb: 0.9 * S });
  else if (b.type === 'image') Object.assign(box, { line: 0, mt: 0.4 * S, mb: 0.9 * S });
  else if (b.type === 'hr') Object.assign(box, { line: 0, mt: 0, mb: 0.6 * S, pt: 0.5 * S, pb: 0.5 * S });
  // A table of contents' own padding, and its first line's above and last line's below (its lines' padding does not collapse).
  else if (b.type === 'toc') Object.assign(box, { mt: 0.2 * S, mb: 1 * S, pt: (0.1 + TOC_PAD) * S, pb: (0.1 + TOC_PAD) * S });
  else if (b.type === 'math') Object.assign(box, { line: 0, mt: 0.5 * S, mb: 1 * S });
  else Object.assign(box, { line: 0, mt: 0, mb: 0 });
  if (prev?.type === 'li' && b.type !== 'li') box.mt = 0.6 * box.size;
  if (top) box.mt = 0;
  if (b.type === 'p' || b.type === 'li') {
    if (b.lh !== undefined) box.line = cssLine(b.lh) * box.size;
    if (b.sb !== undefined) box.mt = b.sb;
    if (b.sa !== undefined) box.mb = b.sa;
  }
  return box;
}

/** A block's place in Word: its box, and the space before and after it there (points). `sep`: for a table right after another, the gap a paragraph between them must make. */
export interface WordPlace {
  box: Box;
  before: number;
  after: number;
  sep?: number;
}

/**
 * Word's space before and after each block (points) that puts the blocks as far apart as the editor does. Word keeps
 * the larger of a paragraph's space after and the next one's space before, as the editor's margins collapse: a block's
 * spaces are its margins, but where padding inside a block comes between (then the space before says the whole gap). A
 * table has none of its own in Word: the paragraph before it ends with the gap above it, the one after it starts with
 * the gap below it. The first block, and one after a page break, start their page with nothing above them (but their own).
 */
export function wordPlaces(doc: Doc, blocks: Block[]): WordPlace[] {
  const out: WordPlace[] = blocks.map((b, i) => ({ box: boxOf(doc, b, blocks[i - 1], i === 0 || blocks[i - 1]?.type === 'pagebreak'), before: 0, after: 0 }));
  blocks.forEach((b, i) => {
    const cur = out[i];
    const prev = out[i - 1];
    const pb = blocks[i - 1];
    if (b.type === 'pagebreak') return;
    const top = i === 0 || pb?.type === 'pagebreak';
    if (b.type === 'table') {
      if (pb?.type === 'table') cur.sep = Math.max(prev.box.mb, cur.box.mt);
      else if (prev && !top) prev.after = prev.box.pb + Math.max(prev.box.mb, cur.box.mt);
      return;
    }
    const gap = top ? cur.box.mt + cur.box.pt : prev.box.pb + Math.max(prev.box.mb, cur.box.mt) + cur.box.pt;
    cur.before = top || pb.type === 'table' || prev.box.pb > 0 || cur.box.pt > 0 ? gap : cur.box.mt;
    cur.after = cur.box.mb + cur.box.pb;
  });
  return out;
}

/** Word's line spacing: `line` points, or a multiple of the font's own line (`rule` absent). */
export interface WordLine {
  line: number;
  rule?: 'atLeast' | 'exact';
}

/**
 * Word's spacing for lines `h` points high, holding words whose tallest Word line is `own` points (`base`: the
 * paragraph's own font and size's): at least h where Word's own lines are no taller (a line still grows for what does
 * not fit); exactly h where they are. Lines that must grow with what they hold (maths among the words, larger words):
 * at least h where the paragraph's own font allows, else the multiple of its Word line that makes h, so a line of
 * larger words grows by as much as the editor's does.
 */
export function wordLineOf(h: number, own: number, grows: boolean, base = own): WordLine {
  if (own <= h + 0.05) return { line: h, rule: 'atLeast' };
  if (!grows) return { line: h, rule: 'exact' };
  if (base <= h + 0.05) return { line: h, rule: 'atLeast' };
  return { line: Math.round((h / base) * 1000) / 1000 };
}

/** The height in points of lines Word spaced as `l`, for words of `size` points in a font whose Word line is `natural` of its size. */
export const lineHeight = (l: WordLine, natural: number, size: number) => (l.rule ? l.line : l.line * natural * size);

/** The tallest Word line among words: each run's font (the block's, or its own) at its size. */
export function ownLine(runs: { font?: string; size?: number; code?: boolean; math?: boolean }[], font: string, mono: string, size: number): number {
  let own = wordLine(font) * size;
  for (const r of runs) {
    if (r.math) continue;
    const f = r.code ? mono : (r.font ?? font);
    own = Math.max(own, wordLine(f) * (r.size ?? size) * (r.code ? 0.9 : 1));
  }
  return own;
}

/** Whether a paragraph's lines must grow with what it holds: maths among its words, or words larger than its own. */
export const grows = (runs: { size?: number; math?: boolean }[], size: number) => runs.some((r) => r.math || (r.size !== undefined && r.size > size * 1.05));
