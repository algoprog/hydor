// Documents: a document kept in Pages (a page of the kind "doc"), as the server, the editor and the exports share
// it, made as in Word or Google Docs: a paper size and margins, the document's own font and size, a header and a
// footer on every page (with its number), and blocks one after another: paragraphs (normal text, a title, a
// subtitle, headings, quotes, code, callouts), list items (bullets, numbers, checklists, five levels deep), tables
// (cells with a fill, merged across rows and columns), pictures, equations, a table of contents, lines across and page
// breaks. A paragraph may have its own line spacing and space before and after. Words are runs of text with their
// look: bold, italic, underlined, struck, code, raised or lowered, a colour, a highlight, a size, a font, a link; a
// run may be maths (LaTeX) among the words, and carry the comments on it (the document keeps their threads). Words and
// blocks may be suggested changes, as Google Docs' Suggesting and Word's tracked changes have them: words to add, words
// to take out (still there, struck through), a new look for words (their old one kept), a paragraph broken in two or
// joined to the one before, a block added or taken out; the document keeps who suggested each, when, and the replies.
//
// normalizeDoc takes what an agent, the editor or an imported file gives (Markdown, lenient blocks, or the model as
// it is kept) and returns the model with every value checked: the editor shows documents inside the app itself, so
// nothing in one may be markup, a script or a style rule; colours, fonts, sizes and addresses are each of a known
// form. docMarkdown writes it back as Markdown, with a few additions for what plain Markdown cannot say; htmlBlocks
// reads HTML (a page, or what is pasted from Word, Google Docs or the web) into blocks; blockHtml draws a block
// for the editor and for the document's own page alike, every word escaped (maths drawn by whoever draws it).
import { cleanAuthor, cleanComments, type Comment, type CommentReply } from './comments.ts';
import { cleanColor, cleanFont, COLOR_REFS, fontCss, FONTS, hexColor, newId, THEMES } from './slides.ts';

export { FONTS, fontCss, newId };
export type { Comment, CommentReply };

export const DOC_LIMITS = { blocks: 20000, runs: 4000, text: 200_000, rows: 500, cols: 30, caption: 1000, levels: 5, tex: 20_000, band: 500, suggestions: 2000, notes: 2000, note: 20_000, sources: 2000, source: 2000 };

/** A picture kept by the app (server/pages/assets.ts), by its content's hash: "naget-asset:<sha>". */
export const ASSET = 'naget-asset:';

export type Align = 'left' | 'center' | 'right' | 'justify';
export type ParaStyle = 'normal' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3' | 'h4' | 'quote' | 'code' | 'callout';
export type ListKind = 'bullet' | 'number' | 'check';
/** How a numbered list counts: 1. 2. 3., a. b. c., i. ii. iii., A. B. C. or I. II. III. */
export type NumFmt = 'decimal' | 'lower-alpha' | 'lower-roman' | 'upper-alpha' | 'upper-roman';
export const NUM_FMTS: NumFmt[] = ['decimal', 'lower-alpha', 'lower-roman', 'upper-alpha', 'upper-roman'];
export type PaperSize = 'a4' | 'letter' | 'legal' | 'a3' | 'a5';
/** The paper sizes a document can be on, the usual one first. */
export const PAPER_SIZES: PaperSize[] = ['a4', 'letter', 'legal', 'a3', 'a5'];

export interface Run {
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  code?: boolean;
  sup?: boolean;
  sub?: boolean;
  /** #rrggbb. */
  color?: string;
  /** A highlight: the colour behind the words, #rrggbb. */
  hl?: string;
  /** Points. */
  size?: number;
  font?: string;
  link?: string;
  /** Maths among the words: `t` is LaTeX, drawn as an equation (a run of its own, never joined to its neighbours). */
  math?: boolean;
  /** A footnote's mark: `t` is its note's id (the document's notes), drawn as the note's number (a run of its own, as maths is). */
  fn?: boolean;
  /**
   * A citation: `t` is what it cites, the sources' keys (the document's sources) with ";" between them, each with what
   * part of it after a comma if it says ("smith2020; jones2019, p. 4"); drawn in the document's citation style.
   */
  cite?: boolean;
  /** A cross-reference: `t` is the id of the block it points to (a heading, a numbered picture, table or equation, a bookmark's paragraph), drawn as what that is called ("Figure 2"). */
  xref?: boolean;
  /** The comments on these words: their ids in the document's comments. */
  cm?: string[];
  /** A suggestion (its id in the document's suggestions): these words are suggested to be added, */
  ins?: string;
  /** or taken out (they stay, struck through, until it is accepted), */
  del?: string;
  /** or to look as they look now: `was` is how they looked before. */
  fmt?: string;
  was?: Look;
}

/** What a run looks like, without its words. */
export type Look = Omit<Run, 't'>;

/**
 * A suggested change of a block: of its own (a table, a picture, a line, a page break…) to add or take out; of a
 * paragraph's or an item's, the break before it, to add (Enter made it: rejected, it joins the one before again) or to
 * take out (accepted, it joins the one before).
 */
export interface Suggested {
  ins?: string;
  del?: string;
}

/** A suggested change, as Google Docs and Word keep one: who made it, when, and the replies to it (what it changes is where its id marks words and blocks). */
export interface Suggestion {
  id: string;
  by: 'user' | 'agent';
  /** Who, by name, when it is someone other than you or an agent (a Word file's tracked changes). */
  author?: string;
  at: number;
  replies?: CommentReply[];
}

/** How a paragraph's lines are spaced; what is left out is as its style has it. */
export interface Spacing {
  /** Line spacing, in lines: 1 single, 1.15, 1.5, 2 double. */
  lh?: number;
  /** The space before and after it, in points. */
  sb?: number;
  sa?: number;
}

export interface ParaBlock extends Spacing, Suggested {
  id: string;
  type: 'p';
  /** Normal text when left out. */
  style?: Exclude<ParaStyle, 'normal'>;
  align?: Align;
  /** Indent, 0–4 steps. */
  lvl?: number;
  /** A callout's emoji (💡 when left out) and the colour behind it (#rrggbb). */
  icon?: string;
  tint?: string;
  /** A bookmark on it, by its name: links and cross-references go to it. */
  bm?: string;
  runs: Run[];
}

export interface ItemBlock extends Spacing, Suggested {
  id: string;
  type: 'li';
  list: ListKind;
  /** A checklist's item, ticked. */
  checked?: boolean;
  /** A numbered item: how its list counts (the first item's, for the whole list); left out: by its level, 1. then a. then i. */
  fmt?: NumFmt;
  /** A numbered item: the number it has, which starts a list of its own from there (Restart numbering is 1, Start at N). */
  start?: number;
  /** A numbered item: its list goes on from the number the one before it left off at (Continue numbering). */
  cont?: boolean;
  /** How deep in the list, 0–4. */
  lvl?: number;
  align?: Align;
  bm?: string;
  runs: Run[];
}

export interface Cell {
  /** Its words; "\n" breaks a line. */
  runs: Run[];
  align?: Align;
  /** The colour behind it, #rrggbb. */
  fill?: string;
  /** Where its words sit, up and down (at the top when left out). */
  va?: 'middle' | 'bottom';
  /** Merged: how many rows and columns it spans from here (the cells it covers keep their places, empty). */
  rs?: number;
  cs?: number;
}

export interface TableBlock extends Suggested {
  id: string;
  type: 'table';
  /** The first row is a header (shaded, repeated on each printed page). */
  head?: boolean;
  /** The columns' widths, as shares of the table's (they add up to 1). */
  cols?: number[];
  /** Its caption, over it; with `label`, numbered as the document's tables are ("Table 2: …"). */
  caption?: string;
  label?: string;
  rows: Cell[][];
}

export interface ImageBlock extends Suggested {
  id: string;
  type: 'image';
  src: string;
  /** Its width, as a share of the text's width (0.05–1). */
  w: number;
  /** Centred when left out. */
  align?: 'left' | 'center' | 'right';
  caption?: string;
  /** Its caption's label: numbered in the document by itself, among the blocks of the same label ("Figure 1: …"). */
  label?: string;
  /** What it shows, for those who cannot see it. */
  alt?: string;
}

export interface RuleBlock extends Suggested {
  id: string;
  type: 'hr';
}

export interface BreakBlock extends Suggested {
  id: string;
  type: 'pagebreak';
}

/** A table of contents: the document's headings, each a link to it, drawn from them wherever it shows. */
export interface TocBlock extends Suggested {
  id: string;
  type: 'toc';
}

/** An equation on a line of its own, in LaTeX; with `label`, numbered ("(3)" at its right, "Equation 3" where it is referred to). */
export interface MathBlock extends Suggested {
  id: string;
  type: 'math';
  tex: string;
  label?: string;
}

/** A bibliography: the sources the document cites, in its citation style, drawn from them wherever it shows. */
export interface BibBlock extends Suggested {
  id: string;
  type: 'bib';
}

export type Block = ParaBlock | ItemBlock | TableBlock | ImageBlock | RuleBlock | BreakBlock | TocBlock | MathBlock | BibBlock;
export type TextBlock = ParaBlock | ItemBlock;
export type BlockType = Block['type'];

export interface Page {
  size: PaperSize;
  /** Millimetres, on every side (but those `margins` gives). */
  margin: number;
  /** Margins of their own on some sides (millimetres), where they are not `margin`: Page setup's Each side. */
  margins?: Partial<Record<Side, number>>;
  /** The paper on its side. */
  orient?: 'landscape';
  /** The words in two or three columns on every page. */
  cols?: 2 | 3;
  /** The paper's colour (#rrggbb); white when left out. */
  color?: string;
}

/** Words (DRAFT) or a picture, faint, across the middle of every page. */
export interface Watermark {
  text?: string;
  src?: string;
}

/** A footnote: its words, at the foot of the page its mark is on (its number, the place of its mark among the others). */
export interface Note {
  id: string;
  runs: Run[];
}

/** A person, as a source names its authors and editors. */
export interface Person {
  family: string;
  given?: string;
}

export type SourceKind = 'article' | 'book' | 'chapter' | 'conference' | 'thesis' | 'report' | 'web' | 'other';

/** A source the document cites: a paper, a book, a web page… (its key is what citations name it by). */
export interface Source {
  /** Its key ("vaswani2017attention"). */
  id: string;
  kind: SourceKind;
  title: string;
  authors?: Person[];
  editors?: Person[];
  /** The year it came out ("2017"); "n.d." when none is known is left out. */
  year?: string;
  /** Where it appeared: a journal, the book a chapter is in, a conference, a website. */
  in?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  url?: string;
  /** When a web page was read (YYYY-MM-DD). */
  accessed?: string;
}

/** How citations and the bibliography are written: APA (7th), MLA (9th), Chicago (author-date, 17th) or IEEE. */
export type CiteStyle = 'apa' | 'mla' | 'chicago' | 'ieee';
export const CITE_STYLES: CiteStyle[] = ['apa', 'mla', 'chicago', 'ieee'];

/** A paragraph style's look changed in a document (Format → Paragraph styles): what it sets, as Word's styles do. */
export interface StyleLook {
  font?: string;
  /** Points. */
  size?: number;
  /** #rrggbb. */
  color?: string;
  b?: boolean;
  i?: boolean;
  /** Line spacing (lines), and the space before and after (points). */
  lh?: number;
  sb?: number;
  sa?: number;
  align?: Align;
}

/** A header or a footer: a line of words on every page's top or bottom margin; {page} and {pages} are the page's number and how many there are. */
export interface Band {
  text: string;
  /** On the left when left out. */
  align?: 'center' | 'right';
}

export interface Doc {
  v: 1;
  page: Page;
  /** The body text's font and its size in points; headings are sized from it. */
  font: string;
  size: number;
  header?: Band;
  footer?: Band;
  /** The first page is a title page: no header or footer on it. */
  titlePage?: boolean;
  blocks: Block[];
  /** The comments on its words, with their replies (runs say where each is, by its id). */
  comments?: Comment[];
  /** The changes suggested in it (runs and blocks say where each is, by its id). */
  suggestions?: Suggestion[];
  /** Its footnotes (runs mark where each is, by its id). */
  notes?: Note[];
  /** The sources it cites, and how citations are written (APA when left out). */
  sources?: Source[];
  cite?: CiteStyle;
  /** Its paragraph styles' own looks (Format → Paragraph styles), where they differ from the app's. */
  styles?: Partial<Record<ParaStyle, StyleLook>>;
  /** A watermark on every page. */
  mark?: Watermark;
  /** The language its words are in (a tag such as "en-US" or "el"): the editor's spell check, and the language Word files say their text is in. Left out: not said. */
  lang?: string;
}

/** A language tag as a document keeps it ("en-us" → "en-US", "EL" → "el"), or undefined when it is not one. */
export function docLang(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^[a-z]{2,3}([-_][a-z0-9]{2,8}){0,3}$/i.test(v.trim())) return undefined;
  const [first, ...rest] = v.trim().split(/[-_]/);
  return [first.toLowerCase(), ...rest.map((p) => (p.length === 2 ? p.toUpperCase() : p.length === 4 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))].join('-');
}

// ---- how documents look --------------------------------------------------------------------------------

/** Paper, in millimetres. */
export const PAPERS: Record<PaperSize, { w: number; h: number; label: string }> = {
  a4: { w: 210, h: 297, label: 'A4' },
  letter: { w: 215.9, h: 279.4, label: 'US Letter' },
  legal: { w: 215.9, h: 355.6, label: 'US Legal' },
  a3: { w: 297, h: 420, label: 'A3' },
  a5: { w: 148, h: 210, label: 'A5' },
};

/** A side of the page, as its margins are given. */
export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

/** The margin on each side of a page, in millimetres. */
export function pageMargins(page: Page): Record<Side, number> {
  const o = page.margins ?? {};
  return { top: o.top ?? page.margin, right: o.right ?? page.margin, bottom: o.bottom ?? page.margin, left: o.left ?? page.margin };
}

/**
 * A page with these margins (millimetres, each kept between 5 and 60): one `margin` when the four are the same, else
 * the one most of them have as `margin` and the others in `margins`.
 */
export function withMargins(page: Page, sides: Partial<Record<Side, number>>): Page {
  const cur = pageMargins(page);
  const m = Object.fromEntries(SIDES.map((k) => [k, clampMargin(sides[k] ?? cur[k])])) as Record<Side, number>;
  const vals = SIDES.map((k) => m[k]);
  const base = vals.reduce((best, v) => (vals.filter((x) => x === v).length > vals.filter((x) => x === best).length ? v : best), vals[0]);
  const own = Object.fromEntries(SIDES.filter((k) => m[k] !== base).map((k) => [k, m[k]]));
  const { margins: _, ...rest } = page;
  return { ...rest, margin: base, ...(Object.keys(own).length ? { margins: own } : {}) };
}

/** A margin as a document keeps it: millimetres to a tenth, between 5 and 60. */
const clampMargin = (mm: number) => Math.min(60, Math.max(5, Math.round((Number.isFinite(mm) ? mm : DOC_DEFAULTS.page.margin) * 10) / 10));

/** The margins in words, for an agent or a message: "25.4 mm margins", or each side's when they differ. */
export function marginsText(page: Page): string {
  const m = pageMargins(page);
  return page.margins && Object.keys(page.margins).length ? `margins of ${m.top} mm at the top, ${m.bottom} mm at the bottom, ${m.left} mm on the left and ${m.right} mm on the right` : `${page.margin} mm margins`;
}

/** The width of the words on a page (between its left and right margins), in millimetres. */
export function textWidthMm(page: Page): number {
  const m = pageMargins(page);
  return paperOf(page).w - m.left - m.right;
}

/** A document's sheet as it lies, in millimetres: its paper, on its side when landscape. */
export function paperOf(page: Page): { w: number; h: number } {
  const p = PAPERS[page.size] ?? PAPERS.a4;
  return page.orient === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** The gap between a document's columns, in millimetres (Word's half an inch). */
export const COLUMN_GAP = 12.7;

/** The width of a column of words (the text's width when there is one column), in millimetres. */
export function columnMm(page: Page): number {
  const text = textWidthMm(page);
  const n = page.cols ?? 1;
  return n > 1 ? (text - (n - 1) * COLUMN_GAP) / n : text;
}

export const MARGINS: { mm: number; label: string }[] = [
  { mm: 12.7, label: 'Narrow' },
  { mm: 25.4, label: 'Medium' },
  { mm: 38.1, label: 'Wide' },
];

export const DOC_DEFAULTS = { font: 'Arial', size: 11, page: { size: 'a4' as PaperSize, margin: 25.4 } };

/** The words' own colour, on white paper. */
export const INK = '#1f2328';
/** The highlight ==words== get. */
export const HL = '#fef08a';
export const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
/** The font code is in (MONO's first). */
export const MONO_FONT = 'JetBrains Mono';

/** Colours for words, and for highlights, as the editor offers them. */
export const TEXT_COLORS = ['#1f2328', '#5f6368', '#c5221f', '#e8710a', '#b06000', '#188038', '#137333', '#1a73e8', '#174ea6', '#9334e6', '#a142f4', '#d01884'];
export const HL_COLORS = [HL, '#fde68a', '#fed7aa', '#fecaca', '#fbcfe8', '#e9d5ff', '#c7d2fe', '#bfdbfe', '#a5f3fc', '#bbf7d0', '#d9f99d', '#e5e7eb'];

/**
 * How each kind of paragraph looks, wherever a document is drawn and in its Word file: its size (times the
 * document's), weight, colour, line height, and the space before and after it (in ems of its own size).
 */
export const STYLES: Record<ParaStyle, { label: string; k: number; bold?: boolean; italic?: boolean; color: string; lh: number; before: number; after: number }> = {
  normal: { label: 'Normal text', k: 1, color: INK, lh: 1.45, before: 0, after: 0.6 },
  title: { label: 'Title', k: 2.4, color: INK, lh: 1.15, before: 0, after: 0.3 },
  subtitle: { label: 'Subtitle', k: 1.35, color: '#5f6368', lh: 1.3, before: 0, after: 0.9 },
  h1: { label: 'Heading 1', k: 1.8, bold: true, color: INK, lh: 1.25, before: 0.9, after: 0.35 },
  h2: { label: 'Heading 2', k: 1.45, bold: true, color: INK, lh: 1.3, before: 0.85, after: 0.3 },
  h3: { label: 'Heading 3', k: 1.22, bold: true, color: INK, lh: 1.35, before: 0.8, after: 0.25 },
  h4: { label: 'Heading 4', k: 1.08, bold: true, color: '#3c4043', lh: 1.4, before: 0.75, after: 0.2 },
  quote: { label: 'Quote', k: 1, italic: true, color: '#3c4043', lh: 1.45, before: 0.3, after: 0.6 },
  code: { label: 'Code', k: 0.9, color: INK, lh: 1.5, before: 0.2, after: 0.8 },
  callout: { label: 'Callout', k: 1, color: INK, lh: 1.45, before: 0.3, after: 0.8 },
};

export const PARA_STYLES: ParaStyle[] = ['normal', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'quote', 'code', 'callout'];

/** A paragraph style's look in a document, as STYLES says one: the app's, with the document's own changes to it. */
export interface StyleOf {
  label: string;
  k: number;
  bold?: boolean;
  italic?: boolean;
  color: string;
  lh: number;
  before: number;
  after: number;
  font?: string;
  align?: Align;
}

/**
 * A paragraph style as a document draws it: the app's (STYLES), changed by the document's own look for it (its size
 * in points as a share of the document's, its spacing in points as ems of its own size, its lines as the editor's).
 * Normal text's font and size are the document's own (Page setup), so it takes only the rest.
 */
export function styleOf(d: Pick<Doc, 'size' | 'styles'>, k: ParaStyle): StyleOf {
  const s = STYLES[k];
  const o = d.styles?.[k];
  if (!o) return s;
  const kk = k !== 'normal' && o.size ? Math.round((o.size / d.size) * 1000) / 1000 : s.k;
  const pt = d.size * kk;
  return {
    ...s,
    k: kk,
    bold: o.b ?? s.bold,
    italic: o.i ?? s.italic,
    color: o.color ?? s.color,
    lh: o.lh !== undefined ? cssLine(o.lh) : s.lh,
    before: o.sb !== undefined ? Math.round((o.sb / pt) * 1000) / 1000 : s.before,
    after: o.sa !== undefined ? Math.round((o.sa / pt) * 1000) / 1000 : s.after,
    ...(o.font && k !== 'normal' ? { font: o.font } : {}),
    ...(o.align ? { align: o.align } : {}),
  };
}

/** A callout's emoji and tint, unless it has its own; and the tints the editor offers (light, as words in ink read on them). */
export const CALLOUT = { icon: '💡', tint: '#fef7e0' };
export const CALLOUT_TINTS = ['#fef7e0', '#e8f0fe', '#e6f4ea', '#fce8e6', '#f3e8fd', '#f1f3f4'];

/** Line spacing as a person picks it (in lines), and the CSS line height it is drawn with: a font's own line is about 1.15 of its size. */
export const LINE_SPACINGS = [1, 1.15, 1.5, 2];
export const cssLine = (lines: number) => Math.round(lines * 1.15 * 1000) / 1000;
const HEADING: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4 };

/** A paragraph style's heading level (1–4), or 0. */
export const headingLevel = (s: ParaStyle | undefined) => HEADING[s ?? ''] ?? 0;

const BULLETS = ['•', '◦', '▪'];

function roman(n: number): string {
  const v = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const s = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
  let out = '';
  for (let i = 0; i < v.length; i++) while (n >= v[i]) (out += s[i]), (n -= v[i]);
  return out;
}

function letters(n: number): string {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s;
  return s;
}

/** The format a numbered list has at a level when it names none: 1. then a. then i., as Word numbers them. */
export const defaultNumFmt = (lvl: number): NumFmt => (lvl % 3 === 0 ? 'decimal' : lvl % 3 === 1 ? 'lower-alpha' : 'lower-roman');

/** A numbered item's mark: 1. a. i. A. I. (by its level, as Word numbers them, unless a format is given). */
export function numberLabel(n: number, lvl: number, fmt: NumFmt = defaultNumFmt(lvl)): string {
  const s = fmt === 'decimal' ? String(n) : fmt === 'lower-alpha' ? letters(n) : fmt === 'lower-roman' ? roman(n) : fmt === 'upper-alpha' ? letters(n).toUpperCase() : roman(n).toUpperCase();
  return `${s}.`;
}

/**
 * Each block's list mark ("3.", "b.", "•"; '' for others and checklists) and, for numbered items, which list it
 * counts in (a list starts again after anything that is not a list item, and where another kind of item comes
 * at its level).
 */
export function listInfo(blocks: Block[]): { labels: string[]; groups: number[]; counts: number[]; fmts: NumFmt[] } {
  const labels: string[] = new Array(blocks.length).fill('');
  const fmts: NumFmt[] = new Array(blocks.length).fill('decimal');
  // The last numbered list at each level, kept across what breaks lists (Continue numbering goes on from it).
  const memo: { count: number; group: number; fmt: NumFmt }[] = [];
  const fmt: NumFmt[] = [];
  const groups: number[] = new Array(blocks.length).fill(0);
  const counts: number[] = new Array(blocks.length).fill(0);
  const count: number[] = [];
  const kind: (ListKind | undefined)[] = [];
  const group: number[] = [];
  let next = 0;
  blocks.forEach((b, i) => {
    if (b.type !== 'li') {
      count.length = 0;
      kind.length = 0;
      group.length = 0;
      return;
    }
    const L = b.lvl ?? 0;
    count.length = Math.min(count.length, L + 1);
    kind.length = Math.min(kind.length, L + 1);
    group.length = Math.min(group.length, L + 1);
    fmt.length = Math.min(fmt.length, L + 1);
    const numbered = b.list === 'number';
    if (kind[L] !== b.list || count[L] === undefined || (numbered && b.start !== undefined)) {
      // An item that goes on from the list before it (Continue numbering) is in that list; else a new list starts here, from 1 or from its own number.
      const back = numbered && b.cont && b.start === undefined ? memo[L] : undefined;
      if (back) {
        count[L] = back.count;
        group[L] = back.group;
        fmt[L] = back.fmt;
      } else {
        count[L] = numbered && b.start !== undefined ? b.start - 1 : 0;
        group[L] = ++next;
        fmt[L] = (numbered && b.fmt) || defaultNumFmt(L);
      }
      kind[L] = b.list;
    }
    count[L]++;
    labels[i] = numbered ? numberLabel(count[L], L, fmt[L]) : b.list === 'bullet' ? BULLETS[L % 3] : '';
    groups[i] = group[L];
    counts[i] = count[L];
    if (numbered) {
      fmts[i] = fmt[L];
      memo[L] = { count: count[L], group: group[L], fmt: fmt[L] };
    }
  });
  return { labels, groups, counts, fmts };
}

// ---- checking values ---------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/g;
const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(CTRL, '').slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
/** One line of words: a caption, a description. */
const oneLine = (v: unknown, max: number) => str(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : def;
};
const pick = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const ALIGNS = ['left', 'center', 'right', 'justify'] as const;
const IMG_ALIGNS = ['left', 'center', 'right'] as const;
const alignOf = (v: unknown): Align | undefined => (v === 'centre' || v === 'middle' ? 'center' : v === 'both' ? 'justify' : pick(v, ALIGNS));

function cleanId(v: unknown, used: Set<string>): string {
  let id = typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : newId();
  while (used.has(id)) id = newId();
  used.add(id);
  return id;
}

const REFS = new Set<string>(COLOR_REFS);

/** A colour as a document keeps it (#rrggbb), from #hex, rgb(), hsl() or a common name; null for none. */
export function docColor(v: unknown): string | null {
  const c = cleanColor(v);
  if (!c || REFS.has(c)) return null;
  const h = hexColor(c, THEMES[0]);
  return h.alpha < 0.05 ? null : `#${h.hex.toLowerCase()}`;
}

/** An address words may open: the web, mail, a phone number (www. is the web), or a place in the document (#a block's id: a heading, a bookmark). */
export function docLink(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  let s = v.trim();
  if (/^#[A-Za-z0-9_-]{1,24}$/.test(s)) return s;
  if (/^www\.[^\s<>"']+$/i.test(s)) s = `https://${s}`;
  if (s.length > 2000) return undefined;
  return /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[+\d][\d\s().-]*)$/i.test(s) ? s : undefined;
}

/** A font's name, or none. */
export function docFont(v: unknown): string | undefined {
  const f = cleanFont(v);
  return f && f !== 'head' && f !== 'body' ? f : undefined;
}

/** A size in points, from points or pixels ("12pt", "16px"); null when it is not one. */
export function ptOf(v: unknown, min = 1, max = 400): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(pt|px)?\s*$/i.exec(v);
    if (!m) return null;
    n = parseFloat(m[1]) * (m[2]?.toLowerCase() === 'px' ? 0.75 : 1);
  } else return null;
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n * 2) / 2)) : null;
}

/** Millimetres from millimetres or a length ("1in", "2.5cm", "72pt"); null when it is not one. */
function mmOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|"|pt)?\s*$/i.exec(v);
  if (!m) return null;
  const k: Record<string, number> = { mm: 1, cm: 10, in: 25.4, '"': 25.4, pt: 25.4 / 72 };
  return parseFloat(m[1]) * k[(m[2] ?? 'mm').toLowerCase()];
}

/** A picture's source: one the app keeps, one inside the document (data:), or on the web. */
export function docSrc(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^naget-asset:[a-f0-9]{16,64}$/.test(s)) return s;
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  if (/^https?:\/\/[^\s<>"'()\\]+$/i.test(s) && s.length <= 2000) return s;
  return null;
}

// ---- runs ----------------------------------------------------------------------------------------------------

const LOOK_KEYS = ['b', 'i', 'u', 's', 'code', 'sup', 'sub', 'color', 'hl', 'size', 'font', 'link'] as const;

const cmKey = (l: Look) => l.cm?.join(' ') ?? '';
/** What a run's suggestion marks are, as one key. */
const sgKey = (l: Look) => (l.ins || l.del || l.fmt ? `${l.ins ?? ''}|${l.del ?? ''}|${l.fmt ?? ''}|${l.was ? JSON.stringify(l.was) : ''}` : '');

/**
 * Whether a run is one thing of its own among the words, never words to type in: maths, a footnote's mark, a citation
 * or a cross-reference (`t` says what it is; the caret goes before or after it, and it is never joined to another run).
 */
export const isAtom = (r: Look) => !!(r.math || r.fn || r.cite || r.xref);
/** Which kind of thing of its own a run is ('' for words). */
export const atomKind = (r: Look): '' | 'math' | 'fn' | 'cite' | 'xref' => (r.math ? 'math' : r.fn ? 'fn' : r.cite ? 'cite' : r.xref ? 'xref' : '');

/** Whether two runs look the same (and carry the same comments and suggestions). */
export const sameLook = (a: Look, b: Look) => LOOK_KEYS.every((k) => a[k] === b[k]) && atomKind(a) === atomKind(b) && cmKey(a) === cmKey(b) && sgKey(a) === sgKey(b);

/** A run's look alone. */
export function lookOf(r: Run): Look {
  const { t: _t, ...look } = r;
  return look;
}

/** Runs as they are kept: empty ones dropped, neighbours that look the same joined. */
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    // Two equations side by side stay two: their LaTeX joined could read as another one (\alpha and b as \alphab); so
    // do two footnotes' marks, citations and cross-references.
    if (last && sameLook(last, r) && !isAtom(r)) out[out.length - 1] = { ...last, t: last.t + r.t };
    else out.push(r);
  }
  return out;
}

/** Comment ids as a run keeps them: each of a known form, once, in order. */
export function cleanCm(v: unknown): string[] | undefined {
  const list = typeof v === 'string' ? v.split(/[\s,]+/) : Array.isArray(v) ? v : [];
  const out = [...new Set(list.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x)))].slice(0, 20);
  return out.length ? out : undefined;
}

export const runsText = (runs: Run[]) => runs.map((r) => r.t).join('');

const SID = /^[A-Za-z0-9_-]{1,40}$/;
/** A suggestion's id, of a known form. */
export const cleanSid = (v: unknown) => (typeof v === 'string' && SID.test(v) ? v : undefined);

/** A run's suggestion marks, checked: added and taken out (by the same person, or the second over the first), a new look with the old one. */
function runMarks(r: Obj, math: boolean): Look {
  const out: Look = {};
  const ins = cleanSid(r.ins);
  const del = cleanSid(r.del);
  if (ins) out.ins = ins;
  if (del) out.del = del;
  const fmt = math ? undefined : cleanSid(r.fmt);
  if (fmt) {
    out.fmt = fmt;
    out.was = isObj(r.was) ? lookOfRun(cleanRun({ ...r.was, ins: undefined, del: undefined, fmt: undefined, cm: undefined, math: undefined }, '')) : {};
  }
  return out;
}

/** A run's look alone, its comments and suggestions left out (what a suggested change of look keeps as the old one). */
function lookOfRun(r: Run): Look {
  const out: Look = {};
  for (const k of LOOK_KEYS) if (r[k] !== undefined) (out as Record<string, unknown>)[k] = r[k];
  return out;
}

const NOTE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const BLOCK_ID = /^[A-Za-z0-9_-]{1,24}$/;
/** A source's key, as BibTeX's keys are written ("vaswani2017attention", "doe:2020"). */
export const SOURCE_KEY = /^[A-Za-z0-9_:.+/-]{1,80}$/;

/** What a citation cites: each source's key and, if it says, which part of it ("p. 4"). */
export function citeItems(t: string): { key: string; loc?: string }[] {
  const out: { key: string; loc?: string }[] = [];
  for (const part of t.split(';')) {
    const m = /^\s*@?([^\s,;]+)\s*(?:,\s*(.*?))?\s*$/.exec(part);
    if (!m || !SOURCE_KEY.test(m[1]) || out.length >= 30) continue;
    const loc = (m[2] ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    out.push(loc ? { key: m[1], loc } : { key: m[1] });
  }
  return out;
}

/** A citation's items as its run keeps them: "key1; key2, p. 4". */
export const citeOf = (items: { key: string; loc?: string }[]) => items.map((x) => (x.loc ? `${x.key}, ${x.loc}` : x.key)).join('; ');

/** A run checked: its words and its look, every value of a known form. */
function cleanRun(r: Obj, t: string): Run {
  const cm = cleanCm(r.cm ?? r.comments);
  // Maths is its LaTeX on one line, with no look of its own but its comments (and whether it is suggested).
  if (r.math === true || typeof r.tex === 'string') {
    const tex = oneLine(typeof r.tex === 'string' ? r.tex : t, DOC_LIMITS.tex);
    return tex ? { t: tex, math: true, ...(cm ? { cm } : {}), ...runMarks(r, true) } : { t: '' };
  }
  // A footnote's mark (its note's id), a citation (the keys it cites) and a cross-reference (the block it points to)
  // are, as maths is, one thing each with no look of its own.
  if (r.fn === true || typeof r.note === 'string') {
    const id = String(typeof r.note === 'string' ? r.note : t).trim();
    return NOTE_ID.test(id) ? { t: id, fn: true, ...(cm ? { cm } : {}), ...runMarks(r, true) } : { t: '' };
  }
  if (r.cite === true) {
    const c = citeOf(citeItems(t));
    return c ? { t: c, cite: true, ...(cm ? { cm } : {}), ...runMarks(r, true) } : { t: '' };
  }
  if (r.xref === true || typeof r.ref === 'string') {
    const id = String(typeof r.ref === 'string' ? r.ref : t).trim();
    return BLOCK_ID.test(id) ? { t: id, xref: true, ...(cm ? { cm } : {}), ...runMarks(r, true) } : { t: '' };
  }
  const out: Run = { t };
  if (cm) out.cm = cm;
  Object.assign(out, runMarks(r, false));
  if (r.b === true || r.bold === true) out.b = true;
  if (r.i === true || r.italic === true) out.i = true;
  if (r.u === true || r.underline === true) out.u = true;
  if (r.s === true || r.strike === true || r.strikethrough === true) out.s = true;
  if (r.code === true) out.code = true;
  if (r.sup === true || r.superscript === true) out.sup = true;
  else if (r.sub === true || r.subscript === true) out.sub = true;
  const color = docColor(r.color);
  if (color) out.color = color;
  const hl = docColor(r.hl ?? r.highlight ?? r.background);
  if (hl) out.hl = hl;
  const size = r.size !== undefined ? ptOf(r.size) : null;
  if (size) out.size = size;
  const font = docFont(r.font);
  if (font) out.font = font;
  const link = docLink(r.link ?? r.href);
  if (link) out.link = link;
  return out;
}

/** Words as runs: a string is Markdown (**bold**, *italic*, [links](…)…); an array holds runs, or strings. */
export function cleanRuns(v: unknown): Run[] {
  if (typeof v === 'string' || typeof v === 'number') return mdRuns(String(v));
  if (!Array.isArray(v)) return [];
  const out: Run[] = [];
  let chars = 0;
  for (const r of v.slice(0, DOC_LIMITS.runs)) {
    if (chars >= DOC_LIMITS.text) break;
    if (typeof r === 'string') {
      const t = str(r, DOC_LIMITS.text - chars);
      chars += t.length;
      out.push({ t });
      continue;
    }
    if (!isObj(r)) continue;
    const t = str(r.t ?? r.text, DOC_LIMITS.text - chars);
    chars += t.length;
    out.push(cleanRun(r, t));
  }
  return mergeRuns(out);
}

// ---- checking blocks -------------------------------------------------------------------------------------

export interface NormalizeOpts {
  /** Picture sources that are not of a kept form (a file of the agent's): what they become; null leaves them out. */
  src?: (s: string) => string | null;
  /** Footnotes written among the blocks (Markdown's [^1]: … lines), by their ids: where they go (left out when not given). */
  notes?: Map<string, Run[]>;
}

/** A block before it is checked: as kept, or one of the shorthands agents write. */
type Raw = Obj;

const STYLE_OF: Record<string, Exclude<ParaStyle, 'normal'> | 'normal'> = {
  p: 'normal',
  paragraph: 'normal',
  text: 'normal',
  normal: 'normal',
  title: 'title',
  subtitle: 'subtitle',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h4',
  h6: 'h4',
  quote: 'quote',
  blockquote: 'quote',
  code: 'code',
  pre: 'code',
  callout: 'callout',
};

/** A map's own entry (never one of Object's: "constructor"). */
const own = <T>(m: Record<string, T>, k: string): T | undefined => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : undefined);

const LIST_OF: Record<string, ListKind> = {
  bullet: 'bullet',
  bullets: 'bullet',
  ul: 'bullet',
  number: 'number',
  numbers: 'number',
  ol: 'number',
  numbered: 'number',
  check: 'check',
  checks: 'check',
  task: 'check',
  todo: 'check',
  checklist: 'check',
};

/** Words of a block, as written: runs, or Markdown (verbatim for code). */
function wordsOf(v: unknown, code: boolean): Run[] {
  if (code && (typeof v === 'string' || typeof v === 'number')) {
    const t = str(v, DOC_LIMITS.text);
    return t ? [{ t }] : [];
  }
  return cleanRuns(v);
}

/** Points from a number or a length ("12pt", "16px"), 0 included; null when it is not one. */
function ptZero(v: unknown, max: number): number | null {
  if (v === 0 || (typeof v === 'string' && /^\s*0+(\.0+)?\s*(pt|px)?\s*$/i.test(v))) return 0;
  return v === undefined || v === null || v === '' ? null : ptOf(v, 0.5, max);
}

/** A paragraph's own spacing, from what was written for it (lh or line; sb or before; sa or after). */
function spacingOf(v: Obj, into: Spacing) {
  const lh = v.lh ?? v.line ?? v.lineSpacing ?? v.spacing;
  if (lh !== undefined && lh !== null && lh !== '') {
    const n = num(typeof lh === 'string' ? lh.replace(/^single$/i, '1').replace(/^double$/i, '2') : lh, 0.5, 5, NaN);
    if (Number.isFinite(n)) into.lh = n;
  }
  const sb = ptZero(v.sb ?? v.before ?? v.spaceBefore, 200);
  if (sb !== null) into.sb = sb;
  const sa = ptZero(v.sa ?? v.after ?? v.spaceAfter, 200);
  if (sa !== null) into.sa = sa;
}

/** A callout's emoji: one symbol or a few (an emoji with its joiners), never words or markup. */
export function cleanIcon(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || s.length > 16 || [...s].length > 8 || /[\s<>&"'`\\{}\p{Cc}]|[A-Za-z]{2}/u.test(s)) return undefined;
  return /[\p{Extended_Pictographic}\p{So}\p{Sm}\p{Sc}\p{Sk}\p{No}\p{P}]/u.test(s) ? s : undefined;
}

/** The emoji a callout's words start with, and the words after it. */
export function leadingIcon(t: string): { icon: string; rest: string } | null {
  const m = /^\s*((?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u2139\u203c\u2049\u2122\u24c2\u3030\u303d\u3297\u3299])(?:[\u{fe0f}\u{20e3}\u{1f3fb}-\u{1f3ff}]|\u200d(?:\p{Extended_Pictographic}|[\u2640\u2642\u2695\u2696\u2708\u2764]))*\u{fe0f}?)\s+/u.exec(t);
  const icon = m ? cleanIcon(m[1]) : undefined;
  return m && icon ? { icon, rest: t.slice(m[0].length) } : null;
}

function para(v: Obj, style: ParaStyle, used: Set<string>, words: unknown): ParaBlock {
  const b = { id: cleanId(v.id, used), type: 'p' } as ParaBlock;
  if (style !== 'normal') b.style = style;
  const align = alignOf(v.align);
  if (align && align !== 'left') b.align = align;
  const lvl = Math.round(num(v.lvl ?? v.indent ?? v.level, 0, 4, 0));
  if (lvl && style !== 'title' && style !== 'subtitle' && !headingLevel(style)) b.lvl = lvl;
  spacingOf(v, b);
  if (style === 'callout') {
    const icon = cleanIcon(v.icon ?? v.emoji);
    if (icon && icon !== CALLOUT.icon) b.icon = icon;
    const tint = docColor(v.tint ?? v.color ?? v.background);
    if (tint && tint !== CALLOUT.tint) b.tint = tint;
  }
  const bm = bookmarkOf(v.bm ?? v.bookmark);
  if (bm) b.bm = bm;
  b.runs = wordsOf(words, style === 'code');
  // A paragraph whose words are a single space (as Markdown writes an empty one) is empty.
  if (b.runs.length === 1 && /^[\s\u00a0]+$/.test(b.runs[0].t) && !b.runs[0].t.includes('\n') && style !== 'code') b.runs = [];
  return b;
}

function item(v: Obj, list: ListKind, used: Set<string>, words: unknown): ItemBlock {
  const b = { id: cleanId(v.id, used), type: 'li', list } as ItemBlock;
  if (list === 'check' && (v.checked === true || v.done === true)) b.checked = true;
  const lvl = Math.round(num(v.lvl ?? v.level ?? v.indent, 0, 4, 0));
  if (lvl) b.lvl = lvl;
  const align = alignOf(v.align);
  if (align && align !== 'left') b.align = align;
  spacingOf(v, b);
  const bm = bookmarkOf(v.bm ?? v.bookmark);
  if (bm) b.bm = bm;
  if (list === 'number') {
    const fmt = pick(v.fmt ?? v.format, NUM_FMTS);
    if (fmt) b.fmt = fmt;
    const start = Math.round(num(v.start, 0, 9999, -1));
    if (start >= 0) b.start = start;
    else if (v.cont === true || v.continue === true) b.cont = true;
  }
  b.runs = cleanRuns(words);
  // "[x] Done" written into a checklist's item.
  if (list === 'check' && b.runs[0]) {
    const m = /^\s*\[([ xX✓])\]\s+/.exec(b.runs[0].t);
    if (m) {
      if (m[1] !== ' ') b.checked = true;
      b.runs = mergeRuns([{ ...b.runs[0], t: b.runs[0].t.slice(m[0].length) }, ...b.runs.slice(1)]);
    }
  }
  return b;
}

/** Items as agents write them: strings (or objects), and arrays under one for the next level down. */
function items(list: unknown[], kind: ListKind, used: Set<string>, out: Block[], lvl = 0) {
  for (const x of list) {
    if (out.length >= DOC_LIMITS.blocks) return;
    if (Array.isArray(x)) items(x, kind, used, out, Math.min(4, lvl + 1));
    else if (typeof x === 'string' || typeof x === 'number') out.push(item({ lvl }, kind, used, String(x)));
    else if (isObj(x)) {
      out.push(item({ lvl, ...x }, pick(x.list, ['bullet', 'number', 'check'] as const) ?? kind, used, x.runs ?? x.text ?? x.t ?? ''));
      if (Array.isArray(x.items)) items(x.items, kind, used, out, Math.min(4, (Number(x.lvl) || lvl) + 1));
    }
  }
}

function cellOf(v: unknown): Cell {
  if (isObj(v)) {
    const c: Cell = { runs: cleanRuns(v.runs ?? v.text ?? v.t ?? '') };
    const align = alignOf(v.align);
    if (align && align !== 'left') c.align = align;
    const fill = docColor(v.fill ?? v.background ?? v.bg);
    if (fill) c.fill = fill;
    const va = v.va ?? v.valign ?? v.vertical;
    if (va === 'middle' || va === 'center' || va === 'centre') c.va = 'middle';
    else if (va === 'bottom') c.va = 'bottom';
    const rs = Math.round(num(v.rs ?? v.rowspan ?? v.rows, 1, DOC_LIMITS.rows, 1));
    const cs = Math.round(num(v.cs ?? v.colspan ?? v.cols, 1, DOC_LIMITS.cols, 1));
    if (rs > 1) c.rs = rs;
    if (cs > 1) c.cs = cs;
    return c;
  }
  return { runs: v === null || v === undefined ? [] : cleanRuns(typeof v === 'string' ? v.replace(/<br\s*\/?>/gi, '\n') : String(v)) };
}

/**
 * A table's merged cells made to fit: each within the table and over no other, the cells it covers empty (their
 * words, if any, joined to its own). Returns, for each cell, the merged one it is under ([row, column]), or null.
 */
export function fixMerges(rows: Cell[][]): ([number, number] | null)[][] {
  const width = rows[0]?.length ?? 0;
  const under: ([number, number] | null)[][] = rows.map((r) => r.map(() => null));
  rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (under[r][c] || (!cell.rs && !cell.cs)) return;
      let rs = Math.min(cell.rs ?? 1, rows.length - r);
      let cs = Math.min(cell.cs ?? 1, width - c);
      // As far as it can go without another merge in the way.
      const clear = (rr: number, cc: number) => !under[rr][cc] && (rr === r && cc === c ? true : !rows[rr][cc].rs && !rows[rr][cc].cs);
      while (cs > 1 && !Array.from({ length: rs }, (_, k) => clear(r + k, c + cs - 1)).every(Boolean)) cs--;
      while (rs > 1 && !Array.from({ length: cs }, (_, k) => clear(r + rs - 1, c + k)).every(Boolean)) rs--;
      if (rs > 1) cell.rs = rs;
      else delete cell.rs;
      if (cs > 1) cell.cs = cs;
      else delete cell.cs;
      if (rs === 1 && cs === 1) return;
      const runs = [...cell.runs];
      for (let rr = r; rr < r + rs; rr++)
        for (let cc = c; cc < c + cs; cc++) {
          if (rr === r && cc === c) continue;
          under[rr][cc] = [r, c];
          const x = rows[rr][cc];
          if (x.runs.some((y) => y.t.trim())) runs.push({ t: '\n' }, ...x.runs);
          rows[rr][cc] = { runs: [] };
        }
      cell.runs = mergeRuns(runs);
    }),
  );
  return under;
}

function table(v: Obj, rowsIn: unknown, used: Set<string>, headDefault: boolean): TableBlock | null {
  const list = Array.isArray(rowsIn) ? rowsIn : [];
  const rows: Cell[][] = [];
  for (const r of list.slice(0, DOC_LIMITS.rows)) {
    const cells = Array.isArray(r) ? r : isObj(r) && Array.isArray(r.cells) ? r.cells : null;
    if (cells) rows.push(cells.slice(0, DOC_LIMITS.cols).map(cellOf));
  }
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!rows.length || !width) return null;
  for (const r of rows) while (r.length < width) r.push({ runs: [] });
  fixMerges(rows);
  const t = { id: cleanId(v.id, used), type: 'table' } as TableBlock;
  if (v.head === true || v.header === true || (v.head === undefined && v.header === undefined && headDefault)) t.head = true;
  const caption = oneLine(v.caption, DOC_LIMITS.caption);
  if (caption) t.caption = caption;
  const label = labelOf(v.label);
  if (label) t.label = label;
  if (Array.isArray(v.cols) && v.cols.length === width) {
    const ws = v.cols.map((c) => (typeof c === 'number' && Number.isFinite(c) && c > 0 ? Math.min(1e6, c) : 0));
    const sum = ws.reduce((a, b) => a + b, 0);
    if (sum > 0 && ws.every((w) => w > 0)) {
      const shares = ws.map((w) => Math.round((w / sum) * 10000) / 10000);
      if (shares.some((s) => Math.abs(s - 1 / width) > 0.004)) t.cols = shares;
    }
  }
  t.rows = rows;
  return t;
}

/** A width as a share of the text's: 0.5, "50%", or a percentage (50). */
function shareOf(v: unknown): number | null {
  if (typeof v === 'string') {
    const m = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(v);
    if (m) return parseFloat(m[1]) / 100;
    const px = /^\s*(\d+(?:\.\d+)?)\s*px\s*$/i.exec(v);
    if (px) return parseFloat(px[1]) / 624;
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n <= 1 ? n : n <= 100 ? n / 100 : null;
}

function image(v: Obj, srcIn: unknown, used: Set<string>, o: NormalizeOpts): ImageBlock | null {
  const raw = typeof srcIn === 'string' ? srcIn.trim() : '';
  const src = docSrc(raw) ?? (raw && o.src ? o.src(raw) : null);
  if (!src) return null;
  const share = shareOf(v.w ?? v.width);
  const b: ImageBlock = { id: cleanId(v.id, used), type: 'image', src, w: share ? Math.min(1, Math.max(0.05, Math.round(share * 1000) / 1000)) : 1 };
  const align = pick(v.align === 'centre' ? 'center' : v.align, IMG_ALIGNS);
  if (align && align !== 'center') b.align = align;
  const caption = oneLine(v.caption, DOC_LIMITS.caption);
  if (caption) b.caption = caption;
  const label = labelOf(v.label);
  if (label) b.label = label;
  const alt = oneLine(v.alt, DOC_LIMITS.caption);
  if (alt) b.alt = alt;
  return b;
}

/** An equation on a line of its own: its LaTeX, the $$ around it (as Markdown writes it) left out. */
function mathBlock(v: Obj, texIn: unknown, used: Set<string>): MathBlock | null {
  const tex = str(texIn, DOC_LIMITS.tex)
    .trim()
    .replace(/^\$\$([\s\S]*)\$\$$/, '$1')
    .replace(/^\\\[([\s\S]*)\\\]$/, '$1')
    .trim();
  if (!tex) return null;
  const label = labelOf(v.label);
  return { id: cleanId(v.id, used), type: 'math', tex, ...(label ? { label } : {}) };
}

/** A caption's label ("Figure", "Table", "Equation", in the document's words): one or two words, no markup. */
export function labelOf(v: unknown): string | undefined {
  if (v === true) return undefined;
  const s = oneLine(v, 40);
  return s && /^[\p{L}][\p{L}\p{M} .'-]{0,39}$/u.test(s) ? s : undefined;
}

/** A bookmark's name: a few words on one line. */
export function bookmarkOf(v: unknown): string | undefined {
  const s = oneLine(v, 80).replace(/[<>"`{}]/g, '');
  return s || undefined;
}

/** Blocks from what was written for one: none, one, or (Markdown, a list) several. */
function blocksOf(v: unknown, used: Set<string>, o: NormalizeOpts, out: Block[]) {
  if (out.length >= DOC_LIMITS.blocks) return;
  if (typeof v === 'string') {
    for (const r of mdBlocks(v)) blocksOf(r, used, o, out);
    return;
  }
  if (!isObj(v)) return;
  const type = typeof v.type === 'string' ? v.type.toLowerCase().replace(/[\s_]+/g, '-') : '';
  const words = v.runs ?? v.text ?? v.t ?? v.content ?? '';
  // A block's own suggested change (its break, for a paragraph or an item), as written for it.
  const ins = cleanSid(v.ins);
  const del = cleanSid(v.del);
  const push = (b: Block | null) => {
    if (!b || out.length >= DOC_LIMITS.blocks) return;
    if (ins) b.ins = ins;
    if (del) b.del = del;
    out.push(b);
  };
  if (type) {
    // A footnote written among the blocks (Markdown's [^1]: …): kept for the document's notes, no block of its own.
    if (type === 'footnote') {
      const id = typeof v.id === 'string' ? v.id : '';
      if (o.notes && NOTE_ID.test(id) && !o.notes.has(id)) o.notes.set(id, cleanRuns(v.runs ?? v.text ?? '').filter((r) => !r.fn));
      return;
    }
    if (type === 'markdown' || type === 'md') return void mdBlocks(str(v.markdown ?? v.text, 4_000_000)).forEach((r) => blocksOf(r, used, o, out));
    if (type === 'heading') return push(para(v, (`h${Math.round(num(v.level ?? v.lvl, 1, 4, 1))}` as ParaStyle), used, words));
    const styled = own(STYLE_OF, type);
    if (styled) return push(para(v, type === 'p' || type === 'paragraph' || type === 'text' ? (own(STYLE_OF, String(v.style ?? 'p')) ?? 'normal') : styled, used, words));
    if (type === 'li' || type === 'item' || type === 'list-item' || own(LIST_OF, type)) {
      const list = own(LIST_OF, String(v.list ?? '')) ?? (v.ordered === true ? 'number' : (own(LIST_OF, type) ?? 'bullet'));
      return push(item(v, list, used, words));
    }
    if (type === 'list') {
      const kind = own(LIST_OF, String(v.list ?? v.kind ?? '')) ?? (v.ordered === true ? 'number' : 'bullet');
      return items(Array.isArray(v.items) ? v.items : [], kind, used, out);
    }
    if (type === 'table') return push(table(v, v.rows ?? v.table ?? v.cells, used, false));
    if (type === 'image' || type === 'img' || type === 'picture' || type === 'figure') return push(image(v, v.src ?? v.url, used, o));
    if (type === 'hr' || type === 'rule' || type === 'line' || type === 'divider' || type === 'separator') return push({ id: cleanId(v.id, used), type: 'hr' });
    if (type === 'pagebreak' || type === 'page-break' || type === 'break' || type === 'newpage') return push({ id: cleanId(v.id, used), type: 'pagebreak' });
    if (type === 'toc' || type === 'contents' || type === 'table-of-contents') return push({ id: cleanId(v.id, used), type: 'toc' });
    if (type === 'bib' || type === 'bibliography' || type === 'references' || type === 'works-cited') return push({ id: cleanId(v.id, used), type: 'bib' });
    if (type === 'math' || type === 'equation' || type === 'formula') return push(mathBlock(v, v.tex ?? v.latex ?? words, used));
    if (type === 'callout' || type === 'note') return push(para(v, 'callout', used, words));
    return;
  }
  // Shorthands: { image: "…" }, { table: [[…]] }, { bullets: ["…", ["…"]] }, { bullet: "…" }, { h2: "Pricing" }.
  if (typeof v.image === 'string' || typeof v.img === 'string' || (typeof v.src === 'string' && v.text === undefined)) return push(image(v, v.image ?? v.img ?? v.src, used, o));
  if (Array.isArray(v.table)) return push(table(v, v.table, used, true));
  if (Array.isArray(v.rows)) return push(table(v, v.rows, used, true));
  if (v.hr === true || v.rule === true || v.line === true || v.divider === true) return push({ id: cleanId(v.id, used), type: 'hr' });
  if (v.pagebreak === true || v.pageBreak === true || v.newpage === true) return push({ id: cleanId(v.id, used), type: 'pagebreak' });
  if (v.toc === true || v.contents === true) return push({ id: cleanId(v.id, used), type: 'toc' });
  if (v.bibliography === true || v.bib === true || v.references === true) return push({ id: cleanId(v.id, used), type: 'bib' });
  if (typeof v.math === 'string' || typeof v.equation === 'string' || typeof v.tex === 'string') return push(mathBlock(v, v.math ?? v.equation ?? v.tex, used));
  if (v.callout !== undefined && (typeof v.callout === 'string' || Array.isArray(v.callout))) return push(para(v, 'callout', used, v.callout));
  if (typeof v.markdown === 'string') return void mdBlocks(v.markdown).forEach((r) => blocksOf(r, used, o, out));
  for (const k of ['bullets', 'numbers', 'checks', 'checklist', 'items', 'list'])
    if (Array.isArray(v[k])) return items(v[k] as unknown[], own(LIST_OF, k) ?? (v.ordered === true ? 'number' : 'bullet'), used, out);
  for (const k of ['bullet', 'number', 'check', 'task', 'todo']) {
    const x = v[k];
    if (x === true) return push(item(v, LIST_OF[k], used, words));
    if (typeof x === 'string' || typeof x === 'number') return push(item(v, LIST_OF[k], used, x));
    if (Array.isArray(x)) {
      // Strings (with arrays a level deeper) are items; objects are the runs of one.
      if (x.every((y) => typeof y === 'string' || typeof y === 'number' || Array.isArray(y))) return items(x, LIST_OF[k], used, out);
      return push(item(v, LIST_OF[k], used, x));
    }
  }
  if (v.heading !== undefined) return push(para(v, (`h${Math.round(num(v.level ?? v.lvl, 1, 4, 1))}` as ParaStyle), used, v.heading));
  for (const k of ['title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'code', 'p', 'paragraph', 'text', 'runs'])
    if (v[k] !== undefined && (typeof v[k] === 'string' || typeof v[k] === 'number' || Array.isArray(v[k]))) return push(para(v, own(STYLE_OF, k) ?? 'normal', used, v[k]));
}

/** Blocks checked: each of a known kind, every value of a known form, ids given where missing (and made unique). */
export function normalizeBlocks(list: unknown[], o: NormalizeOpts = {}, used = new Set<string>()): Block[] {
  const out: Block[] = [];
  for (const v of list) {
    if (out.length >= DOC_LIMITS.blocks) break;
    blocksOf(v, used, o, out);
  }
  return out;
}

/**
 * The document as it is kept, from what an agent, the editor or a file gave: `markdown` (the whole document in
 * Markdown) or `blocks` (as kept, or the shorthands agents write), its `page`, `font` and `size`; unknown fields
 * dropped, every value checked, ids given where missing. A string is the kept text (JSON) or Markdown. Throws when
 * it is not a document at all.
 */
export function normalizeDoc(input: unknown, o: NormalizeOpts = {}): Doc {
  let v: unknown = input;
  if (typeof v === 'string') {
    const s = v.trim();
    v = s.startsWith('{') ? (JSON.parse(s) as unknown) : { markdown: v };
  }
  if (!isObj(v) || (typeof v.markdown !== 'string' && !Array.isArray(v.blocks))) throw new Error('A document needs markdown (a string) or blocks (an array).');
  const pg = typeof v.page === 'string' ? { size: v.page } : isObj(v.page) ? v.page : {};
  const size = pick(String(pg.size ?? pg.paper ?? v.paper ?? '').toLowerCase(), PAPER_SIZES) ?? DOC_DEFAULTS.page.size;
  const margin = clampMargin(mmOf(isObj(pg.margin) ? undefined : (pg.margin ?? v.margin)) ?? DOC_DEFAULTS.page.margin);
  const used = new Set<string>();
  // Footnotes written in the Markdown or among the blocks, then those given as notes.
  const written = new Map<string, Run[]>();
  const opts: NormalizeOpts = { ...o, notes: written };
  const blocks = typeof v.markdown === 'string' && !Array.isArray(v.blocks) ? normalizeBlocks(mdBlocks(v.markdown), opts, used) : normalizeBlocks(v.blocks as unknown[], opts, used);
  if (!blocks.length) blocks.push({ id: cleanId(undefined, used), type: 'p', runs: [] });
  // Each side's own margin (page.margins, or a margin given as {top, bottom, left, right}).
  const sides = isObj(pg.margins) ? pg.margins : isObj(pg.margin) ? pg.margin : null;
  let page: Page = { size, margin };
  if (sides) page = withMargins(page, Object.fromEntries(SIDES.flatMap((k) => (mmOf(sides[k]) !== null ? [[k, mmOf(sides[k])!]] : []))));
  if (/^land/i.test(String(pg.orient ?? pg.orientation ?? v.orientation ?? ''))) page.orient = 'landscape';
  const cols = Math.round(num(pg.cols ?? pg.columns ?? v.columns, 1, 3, 1));
  if (cols > 1) page.cols = cols as 2 | 3;
  const color = docColor(pg.color ?? pg.background ?? v.pageColor);
  if (color && color !== '#ffffff') page.color = color;
  const d: Doc = { v: 1, page, font: docFont(v.font) ?? DOC_DEFAULTS.font, size: ptOf(v.size, 6, 72) ?? DOC_DEFAULTS.size, blocks };
  const header = bandOf(v.header);
  if (header) d.header = header;
  const footer = bandOf(v.footer);
  if (footer) d.footer = footer;
  if (v.titlePage === true && (header || footer)) d.titlePage = true;
  const mark = markOf(v.mark ?? v.watermark, o);
  if (mark) d.mark = mark;
  const sources = cleanSources(v.sources);
  if (sources.length) d.sources = sources;
  const cite = pick(String(v.cite ?? v.citeStyle ?? '').toLowerCase(), CITE_STYLES);
  if (cite && cite !== 'apa') d.cite = cite;
  const styles = cleanStyles(v.styles);
  if (styles) d.styles = styles;
  const lang = docLang(v.lang ?? v.language);
  if (lang) d.lang = lang;
  const given = Array.isArray(v.notes) ? v.notes : [];
  return withNotes(withSuggestions(withComments(d, v.comments), v.suggestions), [...[...written].map(([id, runs]) => ({ id, runs })), ...given]);
}

/** A watermark: its words (a string, or { text }) or a picture ({ src }); none when it has neither. */
function markOf(v: unknown, o: NormalizeOpts): Watermark | undefined {
  const x = typeof v === 'string' ? { text: v } : isObj(v) ? v : null;
  if (!x) return undefined;
  const text = oneLine(x.text, 60);
  const raw = typeof x.src === 'string' ? x.src.trim() : '';
  const src = raw ? (docSrc(raw) ?? (o.src ? o.src(raw) : null)) : null;
  return src ? { src } : text ? { text } : undefined;
}

const SOURCE_KINDS: SourceKind[] = ['article', 'book', 'chapter', 'conference', 'thesis', 'report', 'web', 'other'];

/** People as a source names them: { family, given }, or "Family, Given" and "Given Family" (BibTeX's "and" between them). */
function peopleOf(v: unknown): Person[] {
  const list = typeof v === 'string' ? v.split(/\s+and\s+|;/) : Array.isArray(v) ? v : [];
  const out: Person[] = [];
  for (const x of list.slice(0, 100)) {
    if (typeof x === 'string') {
      const s = oneLine(x.replace(/[{}]/g, ''), 200);
      if (!s) continue;
      if (s.includes(',')) {
        const [family, given] = s.split(',').map((y) => y.trim());
        if (family) out.push(given ? { family, given } : { family });
      } else {
        const words = s.split(' ');
        out.push(words.length > 1 ? { family: words[words.length - 1], given: words.slice(0, -1).join(' ') } : { family: s });
      }
    } else if (isObj(x)) {
      const family = oneLine(x.family ?? x.last ?? x.name, 200);
      const given = oneLine(x.given ?? x.first, 200);
      if (family) out.push(given ? { family, given } : { family });
    }
  }
  return out;
}

/** The sources a document cites, checked: a key of a known form (once each), a kind, a title, the rest a line each. */
export function cleanSources(v: unknown): Source[] {
  if (!Array.isArray(v)) return [];
  const out: Source[] = [];
  const seen = new Set<string>();
  for (const x of v.slice(0, DOC_LIMITS.sources)) {
    if (!isObj(x)) continue;
    const id = String(x.id ?? x.key ?? '').trim();
    const title = oneLine(x.title, DOC_LIMITS.source);
    if (!SOURCE_KEY.test(id) || seen.has(id.toLowerCase()) || !title) continue;
    seen.add(id.toLowerCase());
    const s: Source = { id, kind: pick(x.kind ?? x.type, SOURCE_KINDS) ?? 'other', title };
    const authors = peopleOf(x.authors ?? x.author);
    if (authors.length) s.authors = authors;
    const editors = peopleOf(x.editors ?? x.editor);
    if (editors.length) s.editors = editors;
    for (const k of ['year', 'in', 'volume', 'issue', 'pages', 'publisher', 'accessed'] as const) {
      const val = oneLine(x[k] ?? (k === 'in' ? (x.journal ?? x.container ?? x.booktitle) : undefined), k === 'in' || k === 'publisher' ? 500 : 60);
      if (val) s[k] = val;
    }
    const doi = oneLine(x.doi, 200).replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
    if (/^10\.\d{4,9}\/\S+$/.test(doi)) s.doi = doi;
    const url = docLink(x.url);
    if (url && /^https?:/i.test(url)) s.url = url;
    out.push(s);
  }
  return out;
}

const STYLE_KEYS = ['font', 'size', 'color', 'b', 'i', 'lh', 'sb', 'sa', 'align'] as const;

/** A document's own looks of its paragraph styles, checked (none when it changes none). */
export function cleanStyles(v: unknown): Doc['styles'] | undefined {
  if (!isObj(v)) return undefined;
  const out: Partial<Record<ParaStyle, StyleLook>> = {};
  for (const k of PARA_STYLES) {
    const x = own(v, k);
    if (!isObj(x)) continue;
    const s: StyleLook = {};
    const font = docFont(x.font);
    if (font) s.font = font;
    const size = x.size !== undefined ? ptOf(x.size, 4, 200) : null;
    if (size) s.size = size;
    const color = docColor(x.color);
    if (color) s.color = color;
    if (typeof x.b === 'boolean') s.b = x.b;
    else if (typeof x.bold === 'boolean') s.b = x.bold;
    if (typeof x.i === 'boolean') s.i = x.i;
    else if (typeof x.italic === 'boolean') s.i = x.italic;
    const sp: Spacing = {};
    spacingOf(x, sp);
    Object.assign(s, sp);
    const align = alignOf(x.align);
    if (align) s.align = align;
    if (STYLE_KEYS.some((key) => s[key] !== undefined)) out[k] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A document with its footnotes checked (`list`; none given: the ones it has): each note's words (no footnote in a
 * footnote), only those a mark in the document is for, in the order their marks come; a mark whose note is gone goes too.
 */
export function withNotes(d: Doc, list: unknown = d.notes): Doc {
  const given = new Map<string, Run[]>();
  if (Array.isArray(list))
    for (const x of list.slice(0, DOC_LIMITS.notes)) {
      if (!isObj(x)) continue;
      const id = typeof x.id === 'string' ? x.id.trim() : '';
      if (!NOTE_ID.test(id) || given.has(id)) continue;
      let chars = 0;
      given.set(
        id,
        cleanRuns(x.runs ?? x.text ?? x.t ?? '').filter((r) => !r.fn && (chars += r.t.length) <= DOC_LIMITS.note),
      );
    }
  const order: string[] = [];
  const seen = new Set<string>();
  const fix = (runs: Run[]): Run[] => {
    if (!runs.some((r) => r.fn)) return runs;
    const out = runs.filter((r) => {
      if (!r.fn) return true;
      if (!given.has(r.t)) return false;
      if (!seen.has(r.t)) {
        seen.add(r.t);
        order.push(r.t);
      }
      return true;
    });
    return out.length === runs.length ? runs : mergeRuns(out);
  };
  const blocks = d.blocks.map((b): Block => {
    if (b.type === 'p' || b.type === 'li') {
      const runs = fix(b.runs);
      return runs === b.runs ? b : { ...b, runs };
    }
    if (b.type === 'table' && b.rows.some((r) => r.some((c) => c.runs.some((x) => x.fn)))) return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, runs: fix(c.runs) }))) };
    return b;
  });
  const { notes: _n, ...rest } = d;
  const notes = order.map((id) => ({ id, runs: given.get(id)! }));
  return notes.length ? { ...rest, blocks, notes } : { ...rest, blocks };
}

/** A header or footer from its words (a string) or { text, align }; none when it has no words. */
export function bandOf(v: unknown): Band | undefined {
  const o = typeof v === 'string' ? { text: v } : isObj(v) ? v : null;
  const text = o ? oneLine(o.text ?? o.t, DOC_LIMITS.band) : '';
  if (!text) return undefined;
  const align = o!.align === 'centre' || o!.align === 'middle' ? 'center' : o!.align;
  return align === 'center' || align === 'right' ? { text, align } : { text };
}

/**
 * A document with its comments checked (`list`; none given: the ones it has), and the marks on its words kept only for
 * comments it has. A comment whose words are all gone stays (its quote says what it was about).
 */
export function withComments(d: Doc, list: unknown = d.comments): Doc {
  const comments = cleanComments(list);
  const ids = new Set(comments.map((c) => c.id));
  const fix = (runs: Run[]): Run[] => {
    if (!runs.some((r) => r.cm)) return runs;
    return mergeRuns(
      runs.map((r) => {
        if (!r.cm) return r;
        const cm = r.cm.filter((x) => ids.has(x));
        if (cm.length === r.cm.length) return r;
        const { cm: _cm, ...rest } = r;
        return cm.length ? { ...rest, cm } : rest;
      }),
    );
  };
  const blocks = d.blocks.map((b): Block => {
    if (b.type === 'p' || b.type === 'li') {
      const runs = fix(b.runs);
      return runs === b.runs ? b : { ...b, runs };
    }
    if (b.type === 'table' && b.rows.some((r) => r.some((c) => c.runs.some((x) => x.cm)))) return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, runs: fix(c.runs) }))) };
    return b;
  });
  const { comments: _c, ...rest } = d;
  return comments.length ? { ...rest, blocks, comments } : { ...rest, blocks };
}

/** Suggestions checked: an id of a known form (once), who made it, when, and its replies (plain text, within limits). */
export function cleanSuggestions(v: unknown, now = Date.now()): Suggestion[] {
  if (!Array.isArray(v)) return [];
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const x of v.slice(0, DOC_LIMITS.suggestions)) {
    if (!isObj(x)) continue;
    const id = cleanSid(x.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const at = typeof x.at === 'number' && Number.isFinite(x.at) && x.at > 0 && x.at < 1e14 ? Math.round(x.at) : now;
    const sg: Suggestion = { id, by: x.by === 'agent' ? 'agent' : 'user', at };
    const author = cleanAuthor(x.author);
    if (author) sg.author = author;
    // Its replies checked as a comment's are.
    const replies = cleanComments([{ id: 'r', by: 'user', text: '-', replies: x.replies }], now)[0]?.replies;
    if (replies?.length) sg.replies = replies;
    out.push(sg);
  }
  return out;
}

/**
 * A document with its suggestions checked (`list`; none given: the ones it has). Marks of suggestions it does not have
 * come off (the words stay as they are now); a suggestion that marks nothing any more is left out.
 */
export function withSuggestions(d: Doc, list: unknown = d.suggestions): Doc {
  const sugs = cleanSuggestions(list);
  const ids = new Set(sugs.map((x) => x.id));
  const used = new Set<string>();
  const fixRuns = (runs: Run[]): Run[] => {
    if (!runs.some((r) => r.ins || r.del || r.fmt)) return runs;
    let changed = false;
    const out = runs.map((r) => {
      if (!r.ins && !r.del && !r.fmt) return r;
      const n: Run = { ...r };
      for (const k of ['ins', 'del', 'fmt'] as const) {
        const id = n[k];
        if (!id) continue;
        if (ids.has(id)) used.add(id);
        else {
          delete n[k];
          if (k === 'fmt') delete n.was;
          changed = true;
        }
      }
      return n;
    });
    return changed ? mergeRuns(out) : runs;
  };
  const fixBlock = <B extends Block>(b: B): B => {
    let n = b;
    for (const k of ['ins', 'del'] as const) {
      const id = b[k];
      if (!id) continue;
      if (ids.has(id)) used.add(id);
      else {
        n = { ...n };
        delete n[k];
      }
    }
    return n;
  };
  const blocks = d.blocks.map((b): Block => {
    const own = fixBlock(b);
    if (own.type === 'p' || own.type === 'li') {
      const runs = fixRuns(own.runs);
      return runs === own.runs ? own : { ...own, runs };
    }
    if (own.type === 'table' && own.rows.some((r) => r.some((c) => c.runs.some((x) => x.ins || x.del || x.fmt)))) return { ...own, rows: own.rows.map((r) => r.map((c) => ({ ...c, runs: fixRuns(c.runs) }))) };
    return own;
  });
  const kept = sugs.filter((x) => used.has(x.id));
  const { suggestions: _s, ...rest } = d;
  return kept.length ? { ...rest, blocks, suggestions: kept } : { ...rest, blocks };
}

/** A run with a suggested new look put back as it looked before (its words, comments and other marks kept). */
function lookBack(r: Run): Run {
  const { fmt: _f, was, ...rest } = r;
  const out: Run = { t: rest.t };
  for (const [k, v] of Object.entries(rest)) if (!(LOOK_KEYS as readonly string[]).includes(k) && v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  return { ...out, ...(was ?? {}) };
}

/**
 * A suggestion accepted (its change made: words added kept, words taken out gone, a new look kept, a break made or
 * taken out, a block added or taken out) or rejected (as it was before it), and its record gone; `id` null: every
 * suggestion. A paragraph whose break goes is joined to the paragraph before it.
 */
export function resolveSuggestion(d: Doc, id: string | null, accept: boolean): Doc {
  if (!d.suggestions?.length) return d;
  const hit = (x: string | undefined) => !!x && (id === null || x === id);
  const fixRuns = (runs: Run[]): Run[] => {
    if (!runs.some((r) => hit(r.ins) || hit(r.del) || hit(r.fmt))) return runs;
    const out: Run[] = [];
    for (const r of runs) {
      let n: Run | null = r;
      if (hit(r.ins)) {
        if (accept) {
          n = { ...r };
          delete n.ins;
        } else n = null;
      }
      if (n && hit(n.del)) {
        if (accept) n = null;
        else {
          n = { ...n };
          delete n.del;
        }
      }
      if (n && hit(n.fmt)) {
        if (accept) {
          n = { ...n };
          delete n.fmt;
          delete n.was;
        } else n = lookBack(n);
      }
      if (n) out.push(n);
    }
    return mergeRuns(out);
  };
  const out: Block[] = [];
  for (const b0 of d.blocks) {
    let b: Block = b0;
    if (b.type === 'p' || b.type === 'li') {
      const runs = fixRuns(b.runs);
      if (runs !== b.runs) b = { ...b, runs };
    } else if (b.type === 'table' && b.rows.some((r) => r.some((c) => c.runs.some((x) => hit(x.ins) || hit(x.del) || hit(x.fmt))))) {
      b = { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, runs: fixRuns(c.runs) }))) };
    }
    const insHit = hit(b.ins);
    const delHit = hit(b.del);
    if (insHit || delHit) {
      b = { ...b };
      if (insHit) delete b.ins;
      if (delHit) delete b.del;
      // Its break (a paragraph's) or itself (a block of its own) goes: a paragraph joins the one before it.
      if ((insHit && !accept) || (delHit && accept)) {
        if (b.type !== 'p' && b.type !== 'li') continue;
        const prev = out[out.length - 1];
        if (prev && (prev.type === 'p' || prev.type === 'li')) {
          out[out.length - 1] = { ...prev, runs: mergeRuns([...prev.runs, ...b.runs]) };
          continue;
        }
        if (!b.runs.length && out.length) continue;
      }
    }
    out.push(b);
  }
  if (!out.length) out.push({ id: newId(), type: 'p', runs: [] });
  const rest = id === null ? [] : d.suggestions.filter((x) => x.id !== id);
  return withSuggestions({ ...d, blocks: out, suggestions: rest });
}

/** The document as its suggestions would make it, all accepted (for a file that cannot show them, as Markdown). */
export const asAccepted = (d: Doc) => resolveSuggestion(d, null, true);

/** A new document: its title, and an empty paragraph to write in. */
export function newDoc(title = ''): Doc {
  const t = oneLine(title, 300);
  return {
    v: 1,
    page: { ...DOC_DEFAULTS.page },
    font: DOC_DEFAULTS.font,
    size: DOC_DEFAULTS.size,
    blocks: [
      { id: newId(), type: 'p', style: 'title', runs: t ? [{ t }] : [] },
      { id: newId(), type: 'p', runs: [] },
    ],
  };
}

// ---- the document as text -------------------------------------------------------------------------------

/**
 * The document as text to keep: JSON with a line per block (and per table row), so the changes between two
 * versions read as a diff of lines. normalizeDoc reads it back.
 */
export function docText(d: Doc): string {
  const bands = `${d.header ? `,"header":${JSON.stringify(d.header)}` : ''}${d.footer ? `,"footer":${JSON.stringify(d.footer)}` : ''}${d.titlePage ? ',"titlePage":true' : ''}`;
  const more = `${d.mark ? `,"mark":${JSON.stringify(d.mark)}` : ''}${d.cite ? `,"cite":${JSON.stringify(d.cite)}` : ''}${d.styles ? `,"styles":${JSON.stringify(d.styles)}` : ''}${d.lang ? `,"lang":${JSON.stringify(d.lang)}` : ''}`;
  const out: string[] = [`{"v":1,"page":${JSON.stringify(d.page)},"font":${JSON.stringify(d.font)},"size":${d.size}${bands}${more},"blocks":[`];
  d.blocks.forEach((b, i) => {
    const end = i < d.blocks.length - 1 ? ',' : '';
    if (b.type === 'table') {
      const { rows, ...rest } = b;
      out.push(` ${JSON.stringify(rest).slice(0, -1)},"rows":[`);
      rows.forEach((r, j) => out.push(`  ${JSON.stringify(r)}${j < rows.length - 1 ? ',' : ''}`));
      out.push(` ]}${end}`);
    } else out.push(` ${JSON.stringify(b)}${end}`);
  });
  // Its comments, then its suggestions, a line each.
  const list = (k: string, items: unknown[] | undefined) => {
    if (!items?.length) return;
    out.push(`],"${k}":[`);
    items.forEach((c, i) => out.push(` ${JSON.stringify(c)}${i < items.length - 1 ? ',' : ''}`));
  };
  list('comments', d.comments);
  list('suggestions', d.suggestions);
  list('notes', d.notes);
  list('sources', d.sources);
  out.push(']}');
  return out.join('\n');
}

/** Whether stored page text is a document (rather than a page's HTML or another kind's model). */
export const isDocText = (s: string) => /^\s*\{\s*"v"\s*:\s*1\s*,\s*"page"/.test(s);

/** A block's words as plain text (a table's, a cell a tab and a row a line; a picture's caption). */
export function blockText(b: Block): string {
  if (b.type === 'p' || b.type === 'li') return wordsText(b.runs);
  if (b.type === 'table') return [b.caption ?? '', ...b.rows.map((r) => r.map((c) => wordsText(c.runs).replace(/\n/g, ' ')).join('\t'))].filter(Boolean).join('\n');
  if (b.type === 'image') return b.caption ?? b.alt ?? '';
  return '';
}

/**
 * Runs' words, an equation among them as a mark that stands for it (its LaTeX is not words to count or read); words
 * suggested to be taken out are left out (they are counted as gone).
 */
export const wordsText = (runs: Run[]) => runs.map((r) => (r.del || r.fn ? '' : isAtom(r) ? '\u2063' : r.t)).join('');

/** The headings (and the title), in order: for an outline. */
export function docHeadings(d: Doc): { id: string; index: number; level: number; text: string }[] {
  const out: { id: string; index: number; level: number; text: string }[] = [];
  d.blocks.forEach((b, index) => {
    if (b.type !== 'p') return;
    const level = b.style === 'title' ? 0 : headingLevel(b.style);
    if (b.style !== 'title' && !level) return;
    const text = runsText(b.runs).replace(/\s+/g, ' ').trim();
    if (text) out.push({ id: b.id, index, level, text: text.slice(0, 200) });
  });
  return out;
}

/** The heading of the section a block is in: the nearest heading at or before it. */
export function sectionOf(d: Doc, index: number): { id: string; index: number; level: number; text: string } | null {
  for (let i = Math.min(index, d.blocks.length - 1); i >= 0; i--) {
    const b = d.blocks[i];
    if (b.type === 'p' && headingLevel(b.style)) {
      const text = runsText(b.runs).replace(/\s+/g, ' ').trim();
      if (text) return { id: b.id, index: i, level: headingLevel(b.style), text: text.slice(0, 200) };
    }
  }
  return null;
}

/** The document in a few lines: its title and headings, numbered as sections (2, 2.1…), for an agent. */
export function docOutline(d: Doc): string {
  const n = [0, 0, 0, 0];
  const lines: string[] = [];
  for (const h of docHeadings(d)) {
    if (!h.level) {
      lines.push(`Title: ${h.text}`);
      continue;
    }
    n[h.level - 1]++;
    for (let k = h.level; k < 4; k++) n[k] = 0;
    const label = n.slice(0, h.level).map((x) => x || 1).join('.');
    lines.push(`${'  '.repeat(h.level - 1)}${label} ${h.text}`);
  }
  return lines.join('\n') || '(no headings)';
}

const WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

/** How many words some text has (each Chinese or Japanese character a word, as Word counts them). */
export const wordCount = (s: string) => (s.match(WORD) ?? []).length;

export const docWords = (d: Doc) => d.blocks.reduce((n, b) => n + wordCount(blockText(b)), 0);

/** The fonts a document uses: its own, its words', and its code's (JetBrains Mono, loaded so code looks the same on every computer and in its files). */
export function docFonts(d: Doc): string[] {
  const names = new Set<string>([d.font]);
  const add = (runs: Run[]) => {
    for (const r of runs) {
      if (r.font) names.add(r.font);
      if (r.code) names.add(MONO_FONT);
    }
  };
  for (const b of d.blocks) {
    if (b.type === 'p' || b.type === 'li') add(b.runs);
    else if (b.type === 'table') for (const r of b.rows) for (const c of r) add(c.runs);
    if (b.type === 'p' && b.style === 'code' && !d.styles?.code?.font) names.add(MONO_FONT);
  }
  for (const n of d.notes ?? []) add(n.runs);
  // The fonts its paragraph styles have of their own.
  for (const s of Object.values(d.styles ?? {})) if (s?.font) names.add(s.font);
  return [...names];
}

/** The pictures a document shows. */
export const docSources = (d: Doc) => [...d.blocks.flatMap((b) => (b.type === 'image' && b.src ? [b.src] : [])), ...(d.mark?.src ? [d.mark.src] : [])];

/** The document with each picture's source changed by `f` (to put pictures inside it, say); '' leaves one out. */
export function mapDocSources(d: Doc, f: (src: string) => string): Doc {
  const blocks: Block[] = [];
  for (const b of d.blocks) {
    if (b.type !== 'image') blocks.push(b);
    else {
      const src = f(b.src);
      if (src) blocks.push(src === b.src ? b : { ...b, src });
    }
  }
  // The watermark's picture too (none left, it goes).
  if (d.mark?.src) {
    const src = f(d.mark.src);
    if (src === d.mark.src) return { ...d, blocks };
    const { mark: _m, ...rest } = d;
    return src ? { ...rest, blocks, mark: { src } } : { ...rest, blocks };
  }
  return { ...d, blocks };
}

/** What a block holds, without its id: blocks that hold the same are the same block written again. */
const contentKey = (b: Block) => {
  const { id: _id, ...rest } = b;
  return JSON.stringify(rest);
};

/**
 * `next` (a document written again, by an agent in Markdown say) with the ids of `prev`'s blocks where they are
 * the same block: unchanged ones by what they hold, changed ones by where they stand between those, so the
 * changes between the two versions read as the lines that did change.
 */
export function carryIds(prev: Doc, next: Doc): Doc {
  const byKey = new Map<string, number[]>();
  prev.blocks.forEach((b, i) => {
    const k = contentKey(b);
    byKey.set(k, [...(byKey.get(k) ?? []), i]);
  });
  // Unchanged blocks, in order: each new one takes the first old one like it that comes after the last taken.
  const match: number[] = new Array(next.blocks.length).fill(-1);
  const taken = new Set<number>();
  let last = -1;
  next.blocks.forEach((b, j) => {
    const list = byKey.get(contentKey(b));
    const i = list?.find((x) => x > last && !taken.has(x));
    if (i === undefined) return;
    match[j] = i;
    taken.add(i);
    last = i;
  });
  // Changed blocks between two that match take the old ones there, one for one while their kinds agree.
  let j = 0;
  while (j < next.blocks.length) {
    if (match[j] >= 0) {
      j++;
      continue;
    }
    const from = j;
    while (j < next.blocks.length && match[j] < 0) j++;
    const lo = from > 0 ? match[from - 1] + 1 : 0;
    const hi = j < next.blocks.length ? match[j] : prev.blocks.length;
    for (let a = from, b = lo; a < j && b < hi; a++, b++) {
      if (taken.has(b) || prev.blocks[b].type !== next.blocks[a].type) break;
      match[a] = b;
      taken.add(b);
    }
  }
  const used = new Set<string>();
  const blocks = next.blocks.map((b, k) => {
    const id = match[k] >= 0 ? prev.blocks[match[k]].id : b.id;
    return { ...b, id: cleanId(id, used) };
  });
  return { ...next, blocks };
}

// ---- Markdown in ---------------------------------------------------------------------------------------------

/** Attributes at the end of a block, Pandoc's way: {.center}, {.title}, {indent=1}, {width=50% .left}. */
interface Attrs {
  cls: string[];
  kv: Record<string, string>;
  /** {#id}: the block's id (what links and cross-references to it name). */
  id?: string;
}

const KNOWN_CLS = new Set(['title', 'subtitle', 'left', 'center', 'centre', 'right', 'justify', 'callout']);
const KNOWN_KV = new Set(['indent', 'align', 'width', 'w', 'line', 'before', 'after', 'tint', 'icon', 'ins', 'del', 'label', 'bookmark']);

function parseAttrs(body: string): Attrs | null {
  const a: Attrs = { cls: [], kv: {} };
  const re = /\s*(?:\.([\w-]+)|#([\w-]+)|([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s}]*)))/y;
  let i = 0;
  while (i < body.length) {
    re.lastIndex = i;
    const m = re.exec(body);
    if (!m || m[0].length === 0) {
      if (/^\s*$/.test(body.slice(i))) break;
      return null;
    }
    if (m[1]) a.cls.push(m[1].toLowerCase());
    else if (m[2]) a.id = m[2];
    else if (m[3]) a.kv[m[3].toLowerCase()] = m[4] ?? m[5] ?? m[6] ?? '';
    i = re.lastIndex;
  }
  if (a.id && !BLOCK_ID.test(a.id)) delete a.id;
  return a.id || a.cls.some((c) => KNOWN_CLS.has(c)) || Object.keys(a.kv).some((k) => KNOWN_KV.has(k)) ? a : null;
}

/** A block's words and the attributes written at their end, if any. */
function splitAttrs(text: string): { text: string; attrs: Attrs | null } {
  const m = /(^|[^\\])\{([^{}\n]*)\}\s*$/.exec(text);
  if (!m) return { text, attrs: null };
  const attrs = parseAttrs(m[2]);
  return attrs ? { text: text.slice(0, m.index + m[1].length).replace(/[ \t]+$/, ''), attrs } : { text, attrs: null };
}

function attrsAlign(a: Attrs | null): Align | undefined {
  if (!a) return undefined;
  for (const c of a.cls) if (c === 'center' || c === 'centre' || c === 'left' || c === 'right' || c === 'justify') return c === 'centre' ? 'center' : c;
  return alignOf(a.kv.align);
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘',
  rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', deg: '°', times: '×',
  divide: '÷', plusmn: '±', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', shy: '', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓',
  frac12: '½', frac14: '¼', frac34: '¾', micro: 'µ', alpha: 'α', beta: 'β', pi: 'π', infin: '∞', ne: '≠', le: '≤', ge: '≥', zwj: '\u200d', zwnj: '\u200c', iexcl: '¡', iquest: '¿',
};

/** An entity's character (&amp; &#169; &#x1F600;), or null when it is none. */
function entity(e: string): string | null {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : null;
  }
  return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? null;
}

const decodeEntities = (s: string) => (s.includes('&') ? s.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, e: string) => entity(e) ?? m) : s);

const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const PUNCT = /[!-/:-@[-`{-~\p{P}\p{S}]/u;
const SPACE = /\s/;

type Img = { k: 'img'; img: true; src: string; alt: string; title: string; attrs: Attrs | null; width?: string };
type Piece = Run | Img;
const isImg = (p: Piece): p is Img => (p as Img).img === true;

type Tok =
  | { k: 't'; t: string; m?: Look }
  | { k: 'd'; ch: string; n: number; orig: number; open: boolean; close: boolean; opens: string[]; closes: string[] }
  | { k: 'h'; open: boolean; name: string; m: Look }
  | Img;

/** Attributes of an HTML tag, names in lower case, values decoded. */
function tagAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let m = re.exec(s); m; m = re.exec(s)) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** A style attribute's declarations, by property. */
function styleProps(s: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const d of s.split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim().replace(/\s*!important$/i, '');
  }
  return out;
}

/** The first family of a CSS font-family that is a font's name (not serif, sans-serif…). */
function familyOf(ff: string | undefined): string | undefined {
  const first = (ff ?? '').split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  if (!first || /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|-apple-system|inherit|initial)$/i.test(first)) return undefined;
  return docFont(first);
}

/** The look a style attribute gives, `looks`: colours, sizes and fonts too (else only weight, slant and lines). */
function styleLook(st: Record<string, string>, into: Look, looks: boolean) {
  const fw = st['font-weight'];
  if (fw) {
    if (/^(bold|bolder|[6-9]00)$/.test(fw)) into.b = true;
    else if (/^(normal|lighter|[1-5]00)$/.test(fw)) delete into.b;
  }
  const fs = st['font-style'];
  if (fs) {
    if (/italic|oblique/.test(fs)) into.i = true;
    else if (fs === 'normal') delete into.i;
  }
  const td = st['text-decoration-line'] ?? st['text-decoration'];
  if (td) {
    if (td.includes('underline')) into.u = true;
    if (td.includes('line-through')) into.s = true;
  }
  const va = st['vertical-align'];
  if (va === 'super') {
    into.sup = true;
    delete into.sub;
  } else if (va === 'sub') {
    into.sub = true;
    delete into.sup;
  }
  if (!looks) return;
  const color = docColor(st.color);
  // Black and the ink of pages are the words' own colour, not a colour of their own.
  if (color && !/^#(000000|1f2328|202124|222222|212529|111111|333333|0d0d0d|1a1a1a|24292f)$/.test(color)) into.color = color;
  const bg = docColor(st['background-color'] ?? (st.background && !/url\(|gradient/i.test(st.background) ? st.background.split(/\s+/)[0] : undefined));
  if (bg && !/^#(ffffff|fefefe|fdfdfd|fcfcfc)$/.test(bg)) into.hl = bg;
  const size = st['font-size'] ? ptOf(st['font-size']) : null;
  if (size) into.size = size;
  const font = familyOf(st['font-family']);
  if (font) into.font = font;
}

/** The look an inline HTML tag gives (null when it is not one this knows). */
function tagLook(name: string, at: Record<string, string>, looks: boolean): Look | null {
  const m: Look = {};
  switch (name) {
    case 'b':
    case 'strong':
      m.b = true;
      break;
    case 'i':
    case 'em':
    case 'cite':
    case 'dfn':
    case 'var':
      m.i = true;
      break;
    case 'u':
      m.u = true;
      break;
    case 'ins':
      // A suggestion's words to add (as docMarkdown writes them for an agent); else underlined.
      if (cleanSid(at['data-s'])) m.ins = cleanSid(at['data-s']);
      else m.u = true;
      break;
    case 'del':
      if (cleanSid(at['data-s'])) m.del = cleanSid(at['data-s']);
      else m.s = true;
      break;
    case 's':
    case 'strike':
      m.s = true;
      break;
    case 'code':
    case 'kbd':
    case 'samp':
    case 'tt':
      m.code = true;
      break;
    case 'sup':
      m.sup = true;
      break;
    case 'sub':
      m.sub = true;
      break;
    case 'mark':
      m.hl = HL;
      break;
    case 'a': {
      // A place in this app's own page (#nd-<id>) is that block's; another page's place (#top) is none of this document's.
      const href = at.href ?? '';
      const link = /^#nd-[A-Za-z0-9_-]{1,24}$/.test(href) ? `#${href.slice(4)}` : href.startsWith('#') ? undefined : docLink(href);
      if (link) m.link = link;
      break;
    }
    case 'font':
      if (looks) {
        const c = docColor(at.color);
        if (c) m.color = c;
        const f = familyOf(at.face);
        if (f) m.font = f;
      }
      break;
    case 'span': {
      // The words a comment is on, or with a suggested new look (as docMarkdown writes them for an agent).
      const cm = cleanCm(at['data-comment']);
      if (cm) m.cm = cm;
      const fmt = cleanSid(at['data-s']);
      if (fmt) {
        m.fmt = fmt;
        m.was = wasOf(at['data-was']);
      }
      break;
    }
    case 'small':
    case 'big':
    case 'abbr':
    case 'q':
    case 'label':
    case 'time':
    case 'bdi':
    case 'bdo':
    case 'data':
    case 'nobr':
      break;
    default:
      return null;
  }
  styleLook(styleProps(at.style), m, looks);
  return m;
}

/** Where a code span of `n` backticks from `i` ends, or -1. */
function ticksEnd(s: string, i: number, n: number): number {
  for (let j = s.indexOf('`', i); j >= 0; j = s.indexOf('`', j)) {
    let k = j;
    while (s[k] === '`') k++;
    if (k - j === n) return j;
    j = k;
  }
  return -1;
}

const unescapeMd = (s: string) => s.replace(/\\([!-/:-@[-`{-~])/g, '$1');

/** A link or picture at s[i] ("[" ), Markdown's way: [words](address "title"). */
function linkAt(s: string, i: number): { text: string; dest: string; title: string; end: number } | null {
  let depth = 0;
  let j = i;
  for (; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') {
      j++;
      continue;
    }
    if (ch === '`') {
      let k = j;
      while (s[k] === '`') k++;
      const e = ticksEnd(s, k, k - j);
      if (e >= 0) j = e + (k - j) - 1;
      else j = k - 1;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) break;
  }
  if (j >= s.length || s[j + 1] !== '(') return null;
  let k = j + 2;
  while (s[k] === ' ') k++;
  let dest: string;
  if (s[k] === '<') {
    const e = s.indexOf('>', k);
    if (e < 0) return null;
    dest = s.slice(k + 1, e);
    k = e + 1;
  } else {
    const st = k;
    let par = 0;
    for (; k < s.length; k++) {
      const ch = s[k];
      if (ch === '\\') k++;
      else if (ch === '(') par++;
      else if (ch === ')') {
        if (!par) break;
        par--;
      } else if (/\s/.test(ch)) break;
    }
    dest = s.slice(st, k);
  }
  while (s[k] === ' ') k++;
  let title = '';
  if (s[k] === '"' || s[k] === "'" || (s[k] === '(' && dest)) {
    const close = s[k] === '(' ? ')' : s[k];
    let e = k + 1;
    while (e < s.length && (s[e] !== close || s[e - 1] === '\\')) e++;
    if (e >= s.length) return null;
    title = s.slice(k + 1, e);
    k = e + 1;
    while (s[k] === ' ') k++;
  }
  if (s[k] !== ')') return null;
  return { text: s.slice(i + 1, j), dest: unescapeMd(dest), title: unescapeMd(title), end: k + 1 };
}

/**
 * Maths at s[i] ("$"), as Pandoc reads it: $x^2$ or $$x^2$$, the opening $ followed by no space, the closing one after
 * no space and before no digit (so "$5 and $10" stay words).
 */
function mathAt(s: string, i: number): { tex: string; end: number } | null {
  if (s[i - 1] === '$') return null;
  const n = s[i + 1] === '$' ? 2 : 1;
  const from = i + n;
  if (!s[from] || /\s/.test(s[from]) || s[from] === '$') return null;
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') {
      j++;
      continue;
    }
    if (s[j] === '\n' && s[j + 1] === '\n') return null;
    if (s[j] !== '$') continue;
    if (n === 2 ? s[j + 1] !== '$' : s[j + 1] === '$') return null;
    if (/\s/.test(s[j - 1]) || /\d/.test(s[j + n] ?? '')) return null;
    const tex = s.slice(from, j).replace(/\s+/g, ' ');
    return tex ? { tex, end: j + n } : null;
  }
  return null;
}

/** Attributes in braces at s[i] ("{"), and where they end. */
function braceAt(s: string, i: number): { attrs: Attrs; end: number } | null {
  const e = s.indexOf('}', i);
  if (e < 0 || s.slice(i, e).includes('\n')) return null;
  const attrs = parseAttrs(s.slice(i + 1, e));
  return attrs ? { attrs, end: e + 1 } : null;
}

/** Emphasis as CommonMark matches it: each closing run of * _ ~~ == with the nearest opening one that fits. */
function emphasis(toks: Tok[]) {
  for (let c = 0; c < toks.length; c++) {
    const closer = toks[c];
    if (closer.k !== 'd' || !closer.close) continue;
    while (closer.n > 0) {
      let found = -1;
      for (let o = c - 1, seen = 0; o >= 0 && seen < 300; o--) {
        const op = toks[o];
        if (op.k !== 'd') continue;
        seen++;
        if (op.ch !== closer.ch || !op.open || op.n <= 0) continue;
        if (closer.ch === '~' || closer.ch === '=') {
          if (op.n < 2 || closer.n < 2) continue;
        } else if ((op.close || closer.open) && (op.orig + closer.orig) % 3 === 0 && !(op.orig % 3 === 0 && closer.orig % 3 === 0)) continue;
        found = o;
        break;
      }
      if (found < 0) break;
      const op = toks[found] as Extract<Tok, { k: 'd' }>;
      const use = closer.ch === '~' || closer.ch === '=' ? 2 : op.n >= 2 && closer.n >= 2 ? 2 : 1;
      const mark = closer.ch === '~' ? 's' : closer.ch === '=' ? 'hl' : use === 2 ? 'b' : 'i';
      op.n -= use;
      closer.n -= use;
      op.opens.push(mark);
      closer.closes.push(mark);
      // Runs between the two can no longer match anything: they stay as written.
      for (let k = found + 1; k < c; k++) {
        const x = toks[k];
        if (x.k === 'd') x.open = x.close = false;
      }
    }
  }
}

/** Markdown's inline syntax read into tokens: code, links, pictures, HTML tags, entities, escapes and emphasis. */
function inlineToks(s: string, depth: number): Tok[] {
  const toks: Tok[] = [];
  let buf = '';
  const flush = () => {
    if (buf) toks.push({ k: 't', t: buf });
    buf = '';
  };
  const n = s.length;
  for (let i = 0; i < n; ) {
    const c = s[i];
    if (c === '\\') {
      const d = s[i + 1];
      if (d !== undefined && ASCII_PUNCT.test(d)) {
        buf += d;
        i += 2;
        continue;
      }
      buf += c;
      i++;
      continue;
    }
    if (c === '`') {
      let k = i;
      while (s[k] === '`') k++;
      const e = ticksEnd(s, k, k - i);
      if (e >= 0) {
        flush();
        let code = s.slice(k, e).replace(/\n/g, ' ');
        if (/^ [\s\S]*[^ ][\s\S]* $/.test(code)) code = code.slice(1, -1);
        toks.push({ k: 't', t: code, m: { code: true } });
        i = e + (k - i);
        continue;
      }
      buf += s.slice(i, k);
      i = k;
      continue;
    }
    if (c === '$') {
      const m = mathAt(s, i);
      if (m) {
        flush();
        toks.push({ k: 't', t: m.tex, m: { math: true } });
        i = m.end;
        continue;
      }
    }
    if (c === '!' && s[i + 1] === '[') {
      const l = linkAt(s, i + 1);
      if (l) {
        flush();
        let end = l.end;
        let attrs: Attrs | null = null;
        if (s[end] === '{') {
          const a = braceAt(s, end);
          if (a) {
            attrs = a.attrs;
            end = a.end;
          }
        }
        toks.push({ k: 'img', img: true, src: l.dest, alt: unescapeMd(l.text), title: l.title, attrs });
        i = end;
        continue;
      }
    }
    // A footnote's mark ([^1]) and a citation ([@key; @key2, p. 4]), as Pandoc writes them.
    if (c === '[' && (s[i + 1] === '^' || s[i + 1] === '@')) {
      const e = s.indexOf(']', i);
      const body = e > 0 ? s.slice(i + 2, e) : '';
      if (s[i + 1] === '^' && NOTE_ID.test(body) && s[e + 1] !== ':') {
        flush();
        toks.push({ k: 't', t: body, m: { fn: true } });
        i = e + 1;
        continue;
      }
      const items = s[i + 1] === '@' && e > 0 && !body.includes('\n') ? citeItems(`@${body}`) : [];
      if (items.length && `@${body}`.split(';').every((x) => /^\s*@/.test(x) || !x.trim())) {
        flush();
        toks.push({ k: 't', t: citeOf(items), m: { cite: true } });
        i = e + 1;
        continue;
      }
    }
    if (c === '[' && depth < 3) {
      const l = linkAt(s, i);
      if (l) {
        flush();
        const link = docLink(l.dest);
        for (const p of flatten(inlineToks(l.text, depth + 1))) {
          if (isImg(p)) {
            if (p.alt) toks.push({ k: 't', t: p.alt, m: link ? { link } : {} });
            continue;
          }
          const { t, ...look } = p;
          toks.push({ k: 't', t, m: link ? { ...look, link } : look });
        }
        i = l.end;
        continue;
      }
    }
    if (c === '<') {
      const rest = s.slice(i, i + 2100);
      if (rest.startsWith('<!--')) {
        const e = s.indexOf('-->', i + 4);
        i = e < 0 ? n : e + 3;
        continue;
      }
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(rest);
      if (auto) {
        flush();
        const link = docLink(auto[1]);
        toks.push({ k: 't', t: auto[1].replace(/^mailto:/i, ''), m: link ? { link } : {} });
        i += auto[0].length;
        continue;
      }
      const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/.exec(rest);
      if (tag) {
        const name = tag[2].toLowerCase();
        i += tag[0].length;
        if (name === 'br') buf += '\n';
        else if (name === 'img' && !tag[1]) {
          const at = tagAttrs(tag[3]);
          flush();
          toks.push({ k: 'img', img: true, src: at.src ?? '', alt: at.alt ?? '', title: at.title ?? '', attrs: null, width: at.width });
        } else if (name === 'ref') {
          // A cross-reference: <ref to="id"/> (what it says between, if anything, is drawn anew from what it points to).
          const to = tagAttrs(tag[3]).to ?? '';
          if (!tag[1] && BLOCK_ID.test(to)) {
            flush();
            toks.push({ k: 't', t: to, m: { xref: true } });
            if (!/\/>$/.test(tag[0])) {
              const e = s.toLowerCase().indexOf('</ref>', i);
              if (e >= 0 && e - i < 300) i = e + 6;
            }
          }
        } else {
          const look = tagLook(name, tagAttrs(tag[3]), true);
          // Other tags are left out, their words kept.
          if (look) {
            flush();
            toks.push({ k: 'h', open: !tag[1], name, m: look });
          }
        }
        continue;
      }
    }
    if (c === '&') {
      const e = /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/.exec(s.slice(i, i + 40));
      const ch = e ? entity(e[1]) : null;
      if (e && ch !== null) {
        buf += ch;
        i += e[0].length;
        continue;
      }
    }
    if (c === '*' || c === '_' || c === '~' || c === '=') {
      let k = i;
      while (s[k] === c) k++;
      const len = k - i;
      if ((c === '~' || c === '=') && len < 2) {
        buf += s.slice(i, k);
        i = k;
        continue;
      }
      const prev = i > 0 ? s[i - 1] : ' ';
      const next = k < n ? s[k] : ' ';
      const left = !SPACE.test(next) && (!PUNCT.test(next) || SPACE.test(prev) || PUNCT.test(prev));
      const right = !SPACE.test(prev) && (!PUNCT.test(prev) || SPACE.test(next) || PUNCT.test(next));
      flush();
      toks.push({
        k: 'd',
        ch: c,
        n: len,
        orig: len,
        open: c === '_' ? left && (!right || PUNCT.test(prev)) : left,
        close: c === '_' ? right && (!left || PUNCT.test(next)) : right,
        opens: [],
        closes: [],
      });
      i = k;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  emphasis(toks);
  return toks;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)\]}*_~]/g;

/** Tokens as runs (and pictures), each with the look in effect where it stands. */
function flatten(toks: Tok[]): Piece[] {
  const out: Piece[] = [];
  const count: Record<string, number> = {};
  const tags: { name: string; m: Look }[] = [];
  const cur = (): Look => {
    const m: Look = {};
    for (const t of tags) Object.assign(m, t.m);
    if (count.b) m.b = true;
    if (count.i) m.i = true;
    if (count.s) m.s = true;
    if (count.hl && !m.hl) m.hl = HL;
    return m;
  };
  const push = (t: string, m: Look) => {
    if (!t) return;
    if (m.link || m.code || isAtom(m) || !/https?:\/\/|www\./.test(t)) return void out.push({ t, ...m });
    // Addresses written out are links.
    let at = 0;
    for (const u of t.matchAll(URL_RE)) {
      const link = docLink(u[0]);
      if (!link) continue;
      if (u.index! > at) out.push({ t: t.slice(at, u.index), ...m });
      out.push({ t: u[0], ...m, link });
      at = u.index! + u[0].length;
    }
    if (at < t.length) out.push({ t: t.slice(at), ...m });
  };
  for (const tk of toks) {
    if (tk.k === 'img') out.push(tk);
    else if (tk.k === 't') push(tk.t, { ...cur(), ...(tk.m ?? {}) });
    else if (tk.k === 'd') {
      for (const x of tk.closes) count[x] = (count[x] ?? 1) - 1;
      if (tk.n > 0) push(tk.ch.repeat(tk.n), cur());
      for (const x of tk.opens) count[x] = (count[x] ?? 0) + 1;
    } else if (tk.open) tags.push({ name: tk.name, m: tk.m });
    else {
      for (let j = tags.length - 1; j >= 0; j--)
        if (tags[j].name === tk.name) {
          tags.splice(j, 1);
          break;
        }
    }
  }
  return out;
}

/** A line or a paragraph of Markdown's inline syntax, as runs and pictures. */
function mdPieces(s: string): Piece[] {
  return flatten(inlineToks(s.slice(0, DOC_LIMITS.text), 0));
}

/** Markdown's inline syntax as runs (a picture among them becomes its description). */
export function mdRuns(s: string): Run[] {
  const runs: Run[] = [];
  for (const p of mdPieces(s)) {
    if (!isImg(p)) runs.push(cleanRun(p as unknown as Obj, str(p.t, DOC_LIMITS.text)));
    else if (p.alt) runs.push({ t: p.alt });
  }
  return mergeRuns(runs);
}

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT1 = /^ {0,3}=+[ \t]*$/;
const QUOTE = /^ {0,3}>[ ]?(.*)$/;
const ITEM = /^([ \t]*)([-*+•]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const PAGEBREAK = /^\s*(?:\\(?:pagebreak|newpage|pagebreak\{\})|<(?:div|p|br)\b[^>]*page-break-(?:before|after)\s*:\s*always[^>]*>(?:\s*<\/(?:div|p)>)?)\s*$/i;
const DELIM = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** Columns a line's leading spaces and tabs take (a tab to the next multiple of four). */
function indentOf(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (ch === ' ') n++;
    else if (ch === '\t') n += 4 - (n % 4);
    else break;
  }
  return n;
}

/** A table row's cells: split at the bars that are not escaped (nor in code), the outer ones dropped. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  let tick = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '`') {
      tick = tick ? 0 : 1;
      cur += ch;
    } else if (ch === '|' && !tick) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Whether a line starts a block of its own (and so ends a paragraph before it). */
const startsBlock = (l: string) => FENCE.test(l) || ATX.test(l) || RULE.test(l) || QUOTE.test(l) || ITEM.test(l) || PAGEBREAK.test(l) || /^ {0,3}(\$\$|<table[\s>])/i.test(l);

/** A paragraph's lines as one text: a line ending in two spaces or a backslash breaks there. */
function joinLines(lines: string[]): string {
  let out = '';
  lines.forEach((raw, i) => {
    let l = raw.replace(/^[ \t]+/, '');
    if (i === lines.length - 1) return void (out += l.replace(/[ \t]+$/, ''));
    const spaces = / {2,}$/.test(l);
    l = l.replace(/[ \t]+$/, '');
    const slashes = /\\*$/.exec(l)![0].length;
    if (slashes % 2) l = l.slice(0, -1);
    out += l + (spaces || slashes % 2 ? '\n' : ' ');
  });
  return out;
}

/** Text blocks from a block's words: the attributes at its end, and pictures alone on their line as picture blocks. */
function textBlocks(text: string, base: Raw, out: Raw[]) {
  const { text: t, attrs } = splitAttrs(text);
  const pieces = mdPieces(t);
  const runs = pieces.filter((p): p is Run => !isImg(p));
  const imgs = pieces.filter(isImg);
  const alone = imgs.length === 1 && !runs.some((r) => r.t.trim());
  const last = pieces[pieces.length - 1];
  if (attrs && !alone && last && isImg(last) && !last.attrs && (attrs.kv.width || attrs.kv.w)) last.attrs = attrs;
  const b: Raw = { ...base };
  if (attrs && !alone) {
    if (b.type === 'p' && (!b.style || b.style === 'normal' || headingLevel(b.style as ParaStyle))) {
      if (attrs.cls.includes('title')) b.style = 'title';
      else if (attrs.cls.includes('subtitle')) b.style = 'subtitle';
    }
    const align = attrsAlign(attrs);
    if (align) b.align = align;
    if (attrs.kv.indent) b.lvl = attrs.kv.indent;
    if (attrs.kv.line) b.lh = attrs.kv.line;
    if (attrs.kv.before) b.sb = attrs.kv.before;
    if (attrs.kv.after) b.sa = attrs.kv.after;
    if (b.type === 'p' && attrs.cls.includes('callout')) {
      b.style = 'callout';
      if (attrs.kv.tint) b.tint = attrs.kv.tint;
      if (attrs.kv.icon) b.icon = attrs.kv.icon;
    }
    // A suggested change of its break.
    if (attrs.kv.ins) b.ins = attrs.kv.ins;
    if (attrs.kv.del) b.del = attrs.kv.del;
    if (attrs.id) b.id = attrs.id;
    if (attrs.kv.bookmark) b.bm = attrs.kv.bookmark;
    // A caption's label, on a table's caption line (Table: …).
    if (attrs.kv.label) b.label = attrs.kv.label;
  }
  // A callout's emoji is the first thing in its words.
  if (b.style === 'callout' && !b.icon && runs[0]) {
    const m = leadingIcon(runs[0].t);
    if (m) {
      b.icon = m.icon;
      runs[0] = { ...runs[0], t: m.rest };
    }
  }
  if (!alone && (runs.some((r) => r.t) || !imgs.length)) out.push({ ...b, runs });
  for (const im of imgs) {
    const a = alone ? attrs : im.attrs;
    out.push({ type: 'image', src: im.src, alt: im.alt, caption: im.title, w: a?.kv.width ?? a?.kv.w ?? im.width, align: attrsAlign(a), ins: a?.kv.ins, del: a?.kv.del, label: a?.kv.label, ...(a?.id ? { id: a.id } : {}) });
  }
}

/** GitHub's alerts as callouts: their emoji and tint. */
const ALERTS: Record<string, { icon: string; tint: string }> = {
  note: { icon: 'ℹ️', tint: '#e8f0fe' },
  tip: { icon: '💡', tint: '#e6f4ea' },
  important: { icon: '❗', tint: '#f3e8fd' },
  warning: { icon: '⚠️', tint: '#fef7e0' },
  caution: { icon: '🛑', tint: '#fce8e6' },
};

/** Cells of a table's row: their words (a <br> breaks a line). */
const cellRuns = (s: string) => mdRuns(s);

/**
 * The blocks of a Markdown document: ATX (#) and === headings, paragraphs, - * + bullets, 1. numbers, - [ ] and
 * - [x] checklists (nested by indenting), > quotes, fenced code, GFM tables (their columns' widths by their
 * dashes, as Pandoc reads them), --- *** ___ rules, and \pagebreak (or \newpage) alone on a line. Attributes at the
 * end of a block ({.title} {.subtitle} {.center} {.right} {.justify} {indent=1}) and after a picture
 * ({width=50% .left}) say what Markdown has no syntax for. A paragraph of a single &nbsp; is an empty one.
 */
export function mdBlocks(md: string, depth = 0): Raw[] {
  const lines = String(md ?? '').slice(0, 8_000_000).replace(/\r\n?/g, '\n').split('\n');
  const out: Raw[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) textBlocks(joinLines(para), { type: 'p' }, out);
    para = [];
  };
  // The open lists' markers' columns, outermost first: an item further in is a level deeper.
  let stack: number[] = [];
  let i = 0;
  while (i < lines.length && out.length < DOC_LIMITS.blocks) {
    const line = lines[i];
    if (!line.trim()) {
      endPara();
      i++;
      continue;
    }
    // An equation: $$ on a line of its own (or $$…$$ alone on one), its LaTeX between.
    const dd = /^ {0,3}\$\$(.*)$/.exec(line);
    // Its end may say its number's label and its id ({#eq1 label=Equation}).
    const END = /\$\$\s*(\{[^{}\n]*\})?\s*$/;
    const one = dd ? /^(.*?)\$\$\s*(\{[^{}\n]*\})?\s*$/.exec(dd[1]) : null;
    // Its end: on the same line, or a line ending in $$ not far below (else the line is words that start with $$).
    let ddEnd = one && one[1].trim() ? i : -1;
    if (dd && ddEnd < 0) for (let j = i + 1; j < Math.min(lines.length, i + 300) && ddEnd < 0; j++) if (END.test(lines[j])) ddEnd = j;
    if (dd && ddEnd >= 0) {
      endPara();
      stack = [];
      const body = ddEnd === i ? [one![1]] : [dd[1], ...lines.slice(i + 1, ddEnd), lines[ddEnd].replace(END, '')];
      const at = ddEnd === i ? one![2] : END.exec(lines[ddEnd])?.[1];
      const attrs = at ? parseAttrs(at.slice(1, -1)) : null;
      if (body.join('').trim()) out.push({ type: 'math', tex: body.join('\n').trim(), ...(attrs?.kv.label ? { label: attrs.kv.label } : {}), ...(attrs?.id ? { id: attrs.id } : {}) });
      i = ddEnd + 1;
      continue;
    }
    if (/^ {0,3}(?:\[TOC\]|\[\[_TOC_\]\]|\\tableofcontents)\s*$/i.test(line)) {
      endPara();
      stack = [];
      out.push({ type: 'toc' });
      i++;
      continue;
    }
    // The bibliography: [BIBLIOGRAPHY] (or [REFERENCES]) alone on a line.
    if (/^ {0,3}\[(?:BIBLIOGRAPHY|REFERENCES|WORKS CITED)\]\s*$/i.test(line)) {
      endPara();
      stack = [];
      out.push({ type: 'bib' });
      i++;
      continue;
    }
    // A footnote: [^1]: its words, and the lines after it that are indented (or follow it with no blank line).
    const fnDef = /^ {0,3}\[\^([A-Za-z0-9_-]{1,40})\]:[ \t]?(.*)$/.exec(line);
    if (fnDef && depth === 0) {
      endPara();
      stack = [];
      const body = [fnDef[2]];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (/^ {0,3}\[\^[A-Za-z0-9_-]{1,40}\]:/.test(l)) break;
        if (!l.trim()) {
          if (j + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[j + 1])) {
            body.push('');
            continue;
          }
          break;
        }
        if (/^( {2,}|\t)/.test(l) || (body[body.length - 1] !== '' && !startsBlock(l))) body.push(l.trim());
        else break;
      }
      out.push({ type: 'footnote', id: fnDef[1], runs: mdRuns(joinLines(body.filter((x, k) => x || k < body.length - 1))) });
      i = j;
      continue;
    }
    // A table written in HTML (as docMarkdown writes one with merged or filled cells).
    if (/^ {0,3}<table[\s>]/i.test(line)) {
      endPara();
      stack = [];
      let j = i;
      const html: string[] = [];
      for (; j < lines.length; j++) {
        html.push(lines[j]);
        if (/<\/table>/i.test(lines[j])) {
          j++;
          break;
        }
      }
      out.push(...htmlBlocks(html.join('\n'), { looks: true }));
      i = j;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence && !(fence[2][0] === '`' && fence[3].includes('`'))) {
      endPara();
      stack = [];
      const ch = fence[2][0];
      const close = new RegExp(`^ {0,3}${ch === '`' ? '`' : '~'}{${fence[2].length},}[ \\t]*$`);
      const ind = fence[1].length;
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (close.test(lines[j])) {
          j++;
          break;
        }
        body.push(lines[j].replace(new RegExp(`^ {0,${ind}}`), ''));
      }
      out.push({ type: 'p', style: 'code', runs: body.length ? [{ t: body.join('\n') }] : [] });
      i = j;
      continue;
    }
    if (PAGEBREAK.test(line)) {
      endPara();
      stack = [];
      out.push({ type: 'pagebreak' });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      endPara();
      stack = [];
      out.push({ type: 'hr' });
      i++;
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      endPara();
      stack = [];
      textBlocks(atx[2] ?? '', { type: 'p', style: `h${Math.min(4, atx[1].length)}` }, out);
      i++;
      continue;
    }
    if (SETEXT1.test(line) && para.length) {
      const text = joinLines(para);
      para = [];
      textBlocks(text, { type: 'p', style: 'h1' }, out);
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && DELIM.test(lines[i + 1]) && lines[i + 1].includes('-') && (lines[i + 1].includes('|') || line.trim().startsWith('|'))) {
      endPara();
      stack = [];
      const head = splitRow(line);
      const delim = splitRow(lines[i + 1]);
      const rows: string[][] = [head];
      let j = i + 2;
      for (; j < lines.length && lines[j].trim() && (lines[j].includes('|') || !startsBlock(lines[j])); j++) rows.push(splitRow(lines[j]));
      const width = Math.min(DOC_LIMITS.cols, Math.max(...rows.map((r) => r.length), delim.length));
      const aligns = delim.map((d) => (/^:-+:$/.test(d) ? 'center' : /^-+:$/.test(d) ? 'right' : undefined));
      // A column's width is its delimiter's (colons and all): "---", "--:" and ":-:" say the same.
      const dashes = delim.map((d) => d.replace(/\s/g, '').length);
      const headed = head.some((c) => c.trim());
      const cells = (headed ? rows : rows.slice(1)).map((r) => Array.from({ length: width }, (_, c) => ({ runs: cellRuns(r[c] ?? ''), ...(aligns[c] ? { align: aligns[c] } : {}) })));
      const t: Raw = { type: 'table', rows: cells };
      if (headed) t.head = true;
      if (dashes.length === width && Math.max(...dashes) >= 1.5 * Math.min(...dashes)) t.cols = dashes;
      if (cells.length) out.push(t);
      i = j;
      continue;
    }
    if (QUOTE.test(line)) {
      endPara();
      stack = [];
      const body: string[] = [];
      let j = i;
      for (; j < lines.length; j++) {
        const q = QUOTE.exec(lines[j]);
        if (q) body.push(q[1]);
        // A line that goes on the quote's paragraph without its own ">".
        else if (lines[j].trim() && body.length && body[body.length - 1].trim() && !startsBlock(lines[j])) body.push(lines[j]);
        else break;
      }
      // GitHub's alerts (> [!NOTE], > [!WARNING]…) are callouts.
      const alert = /^\s*\[!(note|tip|important|warning|caution)\]\s*$/i.exec(body[0] ?? '');
      const inner = depth < 4 ? mdBlocks((alert ? body.slice(1) : body).join('\n'), depth + 1) : [{ type: 'p', runs: mdRuns(body.join(' ')) }];
      if (alert) {
        const runs: Run[] = [];
        for (const b of inner) {
          if (!Array.isArray(b.runs)) continue;
          if (runs.length) runs.push({ t: '\n' });
          runs.push(...(b.runs as Run[]));
        }
        out.push({ type: 'p', style: 'callout', ...ALERTS[alert[1].toLowerCase()], runs });
      } else for (const b of inner) out.push(b.type === 'p' && b.style !== 'code' && b.style !== 'callout' ? { ...b, style: 'quote' } : b);
      i = j;
      continue;
    }
    const it = ITEM.exec(line);
    if (it && !(para.length && !stack.length && !/^(?:[-*+]|1[.)])$/.test(it[2]))) {
      endPara();
      const col = indentOf(it[1]);
      while (stack.length && col < stack[stack.length - 1]) stack.pop();
      if (!stack.length || col >= stack[stack.length - 1] + 2) stack.push(col);
      const lvl = Math.min(4, stack.length - 1);
      let text = it[3] ?? '';
      let list: ListKind = /\d/.test(it[2]) ? 'number' : 'bullet';
      let checked = false;
      const task = /^\[([ xX])\](?:[ \t]+|$)(.*)$/.exec(text);
      if (task) {
        list = 'check';
        checked = task[1] !== ' ';
        text = task[2];
      }
      // Its words go on in the lines after it that start no block of their own (indented ones, after a blank line, too).
      const content = col + it[2].length + 1;
      const more: string[] = [text];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) {
          const nx = lines.slice(j + 1).find((x) => x.trim());
          if (nx !== undefined && indentOf(nx) >= content && !ITEM.test(nx)) {
            more.push('');
            continue;
          }
          break;
        }
        if (ITEM.test(l) || FENCE.test(l) || ATX.test(l) || RULE.test(l) || QUOTE.test(l) || PAGEBREAK.test(l)) break;
        if (l.includes('|') && j + 1 < lines.length && DELIM.test(lines[j + 1])) break;
        more.push(l);
      }
      // A blank line inside an item breaks its line, as a paragraph of its own would.
      const parts: string[][] = [[]];
      for (const m of more) {
        if (m === '') parts.push([]);
        else parts[parts.length - 1].push(m);
      }
      textBlocks(parts.map((p) => joinLines(p)).join('\n'), { type: 'li', list, lvl, ...(checked ? { checked: true } : {}) }, out);
      i = j;
      continue;
    }
    // A paragraph's line; a list ends at a paragraph that is not indented under it.
    if (!para.length && stack.length && indentOf(line) < 2) stack = [];
    para.push(line);
    i++;
  }
  endPara();
  return depth ? out : tableCaptions(out);
}

/** A table's caption: a paragraph "Table: …" right before it (or right after it), as Pandoc writes one ({label=Table} numbers it). */
function tableCaptions(list: Raw[]): Raw[] {
  const caption = (b: Raw | undefined) => {
    if (!b || b.type !== 'p' || (b.style && b.style !== 'normal') || !Array.isArray(b.runs)) return null;
    const m = /^\s*Table:\s*([\s\S]*)$/.exec((b.runs as Run[]).map((r) => r.t).join(''));
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
  };
  const gone = new Set<number>();
  list.forEach((t, k) => {
    if (t.type !== 'table' || t.caption) return;
    for (const j of [k - 1, k + 1]) {
      const words = gone.has(j) ? null : caption(list[j]);
      if (words === null) continue;
      t.caption = words;
      if (list[j].label) t.label = list[j].label;
      if (list[j].id && t.id === undefined) t.id = list[j].id;
      gone.add(j);
      break;
    }
  });
  return gone.size ? list.filter((_, k) => !gone.has(k)) : list;
}

// ---- Markdown out ---------------------------------------------------------------------------------------------

/** Text written so Markdown reads it as text: what would be syntax escaped (at a line's start too, with `start`). */
function escText(t: string, start: boolean, table: boolean, dollars = false): string {
  let out = '';
  const alnum = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    const lone = (i === 0 || SPACE.test(t[i - 1])) && (i === t.length - 1 || SPACE.test(t[i + 1]));
    if (ch === '\\' || ch === '`' || ch === '[' || ch === ']') out += `\\${ch}`;
    // A $ that could start maths with one after it (or, with `dollars`, any): "\$5 and \$10$" stays words.
    else if (ch === '$') out += dollars || (t[i + 1] && !SPACE.test(t[i + 1]) && /\S\$/.test(t.slice(i + 1))) ? '\\$' : '$';
    else if (ch === '*') out += lone && !(start && i === 0) ? '*' : '\\*';
    else if (ch === '_') out += lone || (alnum(t[i - 1]) && alnum(t[i + 1])) ? '_' : '\\_';
    else if (ch === '<') out += /[A-Za-z/!?]/.test(t[i + 1] ?? '') ? '\\<' : '<';
    else if (ch === '~' || ch === '=') out += t[i + 1] === ch || t[i - 1] === ch ? `\\${ch}` : ch;
    else if (ch === '&') out += /^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(t.slice(i, i + 40)) ? '\\&' : '&';
    else if (ch === '{') out += /^\{[.#]|^\{[\w-]+=/.test(t.slice(i, i + 40)) ? '\\{' : '{';
    else if (ch === '|' && table) out += '\\|';
    else out += ch;
  }
  if (start) out = out.replace(/^(\s*)(#{1,6}(?=\s|$)|>|[-+](?=\s|$)|-+(?=\s*$)|=+\s*$|•)/, '$1\\$2').replace(/^(\s*\d{1,9})([.)])(?=\s|$)/, '$1\\$2');
  return out;
}

/** A run's look as Markdown's marks, outermost first: a link, a style, the default highlight, bold, italic, struck… */
function marksOf(r: Look, tags: boolean, cm = false): string[] {
  const k: string[] = [];
  if (cm && r.cm) k.push(`c:${r.cm.join(' ')}`);
  // Suggested changes, for an agent (with the comments): words taken out, added, or with a new look.
  if (cm && r.del) k.push(`del:${r.del}`);
  if (cm && r.ins) k.push(`ins:${r.ins}`);
  if (cm && r.fmt) k.push(`fmt:${r.fmt}:${JSON.stringify(r.was ?? {})}`);
  if (r.link) k.push(`a:${r.link}`);
  const st: string[] = [];
  if (r.color) st.push(`color:${r.color}`);
  if (r.hl && r.hl !== HL) st.push(`background-color:${r.hl}`);
  if (r.size) st.push(`font-size:${r.size}pt`);
  if (r.font) st.push(`font-family:${r.font}`);
  if (st.length) k.push(`span:${st.join('; ')}`);
  if (r.hl === HL) k.push(tags ? 'mark' : 'hl');
  if (r.b) k.push(tags ? 'tb' : 'b');
  if (r.i) k.push(tags ? 'ti' : 'i');
  if (r.s) k.push(tags ? 'ts' : 's');
  if (r.u) k.push('u');
  if (r.sup) k.push('sup');
  else if (r.sub) k.push('sub');
  return k;
}

const OPEN: Record<string, string> = { hl: '==', b: '**', i: '*', s: '~~', u: '<u>', sup: '<sup>', sub: '<sub>', mark: '<mark>', tb: '<b>', ti: '<i>', ts: '<s>' };
const CLOSE: Record<string, string> = { hl: '==', b: '**', i: '*', s: '~~', u: '</u>', sup: '</sup>', sub: '</sub>', mark: '</mark>', tb: '</b>', ti: '</i>', ts: '</s>' };

/** Spaces at the edges of a marked run take only the marks their neighbour on that side shares (so "**bold** next"). */
function shiftSpaces(runs: Run[]): Run[] {
  const out: Run[] = [];
  // A comment's mark is a span, which holds spaces as well as words: they keep it.
  const common = (a: Run, b: Run | undefined): Look => {
    const m: Look = a.cm ? { cm: a.cm } : {};
    if (a.ins) m.ins = a.ins;
    if (a.del) m.del = a.del;
    if (a.fmt) {
      m.fmt = a.fmt;
      m.was = a.was;
    }
    if (!b) return m;
    for (const k of LOOK_KEYS) if (a[k] !== undefined && a[k] === b[k]) (m as Record<string, unknown>)[k] = a[k];
    return m;
  };
  runs.forEach((r, i) => {
    if (r.code || isAtom(r)) return void out.push(r);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.t)!;
    if (!m[2]) return void out.push({ ...common(r, runs[i - 1] ?? runs[i + 1]), t: r.t });
    if (m[1]) out.push({ ...common(r, runs[i - 1]), t: m[1] });
    out.push({ ...r, t: m[2] });
    if (m[3]) out.push({ ...common(r, runs[i + 1]), t: m[3] });
  });
  return mergeRuns(out);
}

/** Runs as Markdown, marks opened and closed as a stack; `nl` follows each line break. */
function writeRuns(runs: Run[], o: { table: boolean; nl: string; tags: boolean; cm?: boolean; dollars?: boolean }): string {
  let out = '';
  const stack: string[] = [];
  const close = (to: number) => {
    while (stack.length > to) {
      const k = stack.pop()!;
      out += k.startsWith('a:')
        ? `](${/[()\s<>]/.test(k.slice(2)) ? `<${k.slice(2)}>` : k.slice(2)})`
        : k.startsWith('span:') || k.startsWith('c:') || k.startsWith('fmt:')
          ? '</span>'
          : k.startsWith('ins:')
            ? '</ins>'
            : k.startsWith('del:')
              ? '</del>'
              : CLOSE[k];
    }
  };
  for (const r of runs) {
    const want = marksOf(r, o.tags, o.cm);
    let k = 0;
    while (k < stack.length && k < want.length && stack[k] === want[k]) k++;
    close(k);
    for (const m of want.slice(k)) {
      const fmt = m.startsWith('fmt:') ? /^fmt:([^:]*):(.*)$/.exec(m) : null;
      out += m.startsWith('a:')
        ? '['
        : m.startsWith('span:')
          ? `<span style="${m.slice(5)}">`
          : m.startsWith('c:')
            ? `<span data-comment="${m.slice(2)}">`
            : m.startsWith('ins:')
              ? `<ins data-s="${m.slice(4)}">`
              : m.startsWith('del:')
                ? `<del data-s="${m.slice(4)}">`
                : fmt
                  ? `<span data-s="${fmt[1]}" data-was="${escHtml(fmt[2])}">`
                  : OPEN[m];
      stack.push(m);
    }
    if (r.math) {
      out += `$${r.t.replace(/\n/g, ' ')}$`;
      continue;
    }
    // A footnote's mark, a citation and a cross-reference, as Pandoc writes the first two.
    if (r.fn) {
      out += `[^${r.t}]`;
      continue;
    }
    if (r.cite) {
      out += `[${citeItems(r.t)
        .map((x) => `@${x.key}${x.loc ? `, ${x.loc.replace(/[\]\[;]/g, '')}` : ''}`)
        .join('; ')}]`;
      continue;
    }
    if (r.xref) {
      out += `<ref to="${r.t}"/>`;
      continue;
    }
    const lines = r.t.split('\n');
    lines.forEach((line, j) => {
      if (j) out += o.table ? '<br>' : o.nl;
      if (!line) return;
      if (r.code) {
        const ticks = '`'.repeat(Math.max(0, ...(line.match(/`+/g) ?? []).map((x) => x.length)) + 1);
        const pad = /^`|`$|^ .* $/.test(line) ? ' ' : '';
        out += `${ticks}${pad}${line.replace(/\|/g, o.table ? '\\|' : '|')}${pad}${ticks}`;
      } else out += escText(line, !out || out.endsWith('\n') || out.endsWith(o.nl), o.table, o.dollars);
    });
  }
  close(0);
  return out;
}

const sameRuns = (a: Run[], b: Run[]) => a.length === b.length && a.every((r, i) => r.t === b[i].t && sameLook(r, b[i]));

/** A block's runs as Markdown that reads back as the same runs: marks as * and ~~ where they can be, as tags where not. */
function runsMdOf(runs: Run[], o: { table?: boolean; nl?: string; cm?: boolean } = {}): string {
  const rs = shiftSpaces(mergeRuns(o.cm ? runs : runs.some((r) => r.cm) ? runs.map(({ cm: _cm, ...r }) => r) : runs));
  const opts = { table: !!o.table, nl: o.nl ?? '\\\n', tags: false, cm: !!o.cm };
  const md = writeRuns(rs, opts);
  const back = (s: string) => mdRuns(o.table ? s : s.replace(new RegExp(opts.nl.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'g'), '\n'));
  if (sameRuns(back(md), rs)) return md;
  const tagged = writeRuns(rs, { ...opts, tags: true });
  return sameRuns(back(tagged), rs) ? tagged : writeRuns(rs, { ...opts, tags: true, dollars: true });
}

function attrsMd(a: { id?: string; cls?: string[]; kv?: Record<string, string | number> }): string {
  const val = (v: string | number) => (typeof v === 'number' || /^[\w.%#-]+$/u.test(v) ? String(v) : `"${String(v).replace(/"/g, "'")}"`);
  const parts = [...(a.id ? [`#${a.id}`] : []), ...(a.cls ?? []).map((c) => `.${c}`), ...Object.entries(a.kv ?? {}).map(([k, v]) => `${k}=${val(v)}`)];
  return parts.length ? ` {${parts.join(' ')}}` : '';
}

/** A paragraph's own spacing as attributes: {line=1.5 before=12 after=0}. */
const spacingKv = (b: Spacing): Record<string, number> => ({ ...(b.lh !== undefined ? { line: b.lh } : {}), ...(b.sb !== undefined ? { before: b.sb } : {}), ...(b.sa !== undefined ? { after: b.sa } : {}) });

/** A block's own suggested change as attributes, for an agent ({ins=s1}, {del=s1}). */
const marksKv = (b: Suggested, cm: boolean): Record<string, string> => (cm ? { ...(b.ins ? { ins: b.ins } : {}), ...(b.del ? { del: b.del } : {}) } : {});

/** Whether a table says more than Markdown's tables can (merged or filled cells, words set low): written as HTML then. */
const htmlTable = (t: TableBlock) => t.rows.some((r) => r.some((c) => c.rs || c.cs || c.fill || c.va));

/** A table as HTML that htmlBlocks reads back: its widths, header, merged cells, fills and alignment, its words' looks. */
export function tableHtml(t: TableBlock, o: { cm?: boolean } = {}): string {
  const under = fixMerges(t.rows.map((r) => r.map((c) => ({ ...c }))));
  const cell = (c: Cell, r: number, k: number, th: boolean) => {
    if (under[r][k]) return '';
    const st = [c.fill ? `background-color:${c.fill}` : '', c.va ? `vertical-align:${c.va}` : '', c.align ? `text-align:${c.align}` : ''].filter(Boolean).join(';');
    const tag = th ? 'th' : 'td';
    return `<${tag}${c.cs ? ` colspan="${c.cs}"` : ''}${c.rs ? ` rowspan="${c.rs}"` : ''}${st ? ` style="${st}"` : ''}>${runsInline(c.runs, o)}</${tag}>`;
  };
  const row = (r: Cell[], ri: number, th: boolean) => `<tr>${r.map((c, k) => cell(c, ri, k, th)).join('')}</tr>`;
  const cols = t.cols ? `<colgroup>${t.cols.map((w) => `<col style="width:${Math.round(w * 10000) / 100}%">`).join('')}</colgroup>` : '';
  const head = t.head ? `<thead>${row(t.rows[0], 0, true)}</thead>` : '';
  const marks = o.cm ? `${t.ins ? ` data-ins="${escHtml(t.ins)}"` : ''}${t.del ? ` data-del="${escHtml(t.del)}"` : ''}` : '';
  return `<table${marks}>${cols}${head}<tbody>${t.rows.map((r, ri) => (t.head && ri === 0 ? '' : row(r, ri, false))).join('')}</tbody></table>`;
}

/** Runs as HTML that htmlBlocks reads back (maths, footnotes' marks, citations and cross-references as what they keep, in a marked span; comments' marks for an agent). */
function runsInline(runs: Run[], o: { cm?: boolean }): string {
  return runs
    .map((r) => {
      const k = atomKind(r);
      const h = k ? `<span data-tex="${escHtml(r.t)}"${k !== 'math' ? ` data-k="${k}"` : ''}>${escHtml(r.t)}</span>` : runHtml({ ...r, cm: undefined }, { view: true });
      return o.cm && r.cm ? `<span data-comment="${r.cm.join(' ')}">${h}</span>` : h;
    })
    .join('');
}

/**
 * What a document's marks show where they are, worked out from the whole of it (doc-refs.ts): footnotes' numbers,
 * citations in the document's style, cross-references and numbered captions' labels, the bibliography's entries.
 */
export interface DocRefs {
  /** A footnote's number, by its note's id (0 when it has none). */
  note(id: string): number;
  /** What a citation or a cross-reference shows ("(Vaswani et al., 2017)", "[3]", "Figure 2", a heading's words). */
  text(r: Run): string;
  /** A numbered block's label and number ("Figure 2"), by its id; null for one that is not numbered. */
  label(id: string): string | null;
  /** The bibliography's entries, in its order, each as runs (titles in italics…). */
  bib(): Run[][];
}

export interface MarkdownOpts {
  /** For an agent: the words comments are on, marked (<span data-comment="id">), to keep or answer. */
  comments?: boolean;
  /**
   * For a file: a table of contents as a list of links to its headings (as GitHub names them), not [TOC]; with `refs`,
   * citations and cross-references as their words, numbered captions with their labels, and the bibliography's
   * entries (else they are written as an agent writes them, to read back).
   */
  tocLinks?: boolean;
  refs?: DocRefs;
}

/** Each footnote's number: where its first mark comes among the others. */
export function noteNumbers(d: Doc): Map<string, number> {
  const out = new Map<string, number>();
  const take = (runs: Run[]) => {
    for (const r of runs) if (r.fn && !out.has(r.t)) out.set(r.t, out.size + 1);
  };
  for (const b of d.blocks) {
    if (b.type === 'p' || b.type === 'li') take(b.runs);
    else if (b.type === 'table') for (const row of b.rows) for (const c of row) take(c.runs);
  }
  return out;
}

/** The blocks a document points to: by a cross-reference, a link to a place in it, or a bookmark. */
function targetsOf(d: Doc): Set<string> {
  const out = new Set<string>();
  const take = (runs: Run[]) => {
    for (const r of runs) {
      if (r.xref) out.add(r.t);
      if (r.link?.startsWith('#')) out.add(r.link.slice(1));
    }
  };
  for (const b of d.blocks) {
    if (b.type === 'p' || b.type === 'li') {
      take(b.runs);
      if (b.bm) out.add(b.id);
    } else if (b.type === 'table') for (const row of b.rows) for (const c of row) take(c.runs);
  }
  for (const n of d.notes ?? []) take(n.runs);
  return out;
}

/** A heading's anchor as GitHub makes it from its words: lower case, words joined by dashes, others left out. */
const slug = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

/** A table of contents as Markdown's list of links, each heading's level a level of the list. */
function tocList(d: Doc): string {
  const seen = new Map<string, number>();
  const anchors = new Map<string, string>();
  for (const h of docHeadings(d)) {
    if (!h.level) continue;
    const base = slug(h.text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.set(h.id, n ? `${base}-${n}` : base);
  }
  const lines = tocEntries(d).map((e) => `${'  '.repeat(e.level - 1)}- [${e.text.replace(/([\\[\]])/g, '\\$1')}](#${anchors.get(e.id) ?? slug(e.text)})`);
  return lines.join('\n') || '[TOC]';
}

/**
 * The document as Markdown, as mdBlocks reads it back: headings, paragraphs, lists, quotes, callouts, code, tables,
 * pictures, equations ($$…$$, and $…$ among words), a table of contents ([TOC]), rules and page breaks, with
 * {.title} {.center} {indent=1} {line=1.5 before=12 after=0}-style attributes, <u>, <sup>, <sub>, ==highlights== and
 * <span style> for colours, sizes and fonts; a table with merged or filled cells as HTML. What it cannot hold: block
 * ids, a table's alignment cell by cell (a column's is kept), spaces at the start of a line, the document's paper,
 * margins, font and size, its header and footer, and (but for an agent, with `comments`) its comments.
 */
export function docMarkdown(d: Doc, o: MarkdownOpts = {}): string {
  const { counts } = listInfo(d.blocks);
  const parts: string[] = [];
  const cm = !!o.comments;
  // Footnotes' marks by their numbers ([^1]), and (for a file) citations and cross-references as their words.
  const nums = noteNumbers(d);
  const refs = o.tocLinks ? o.refs : undefined;
  const marks = (runs: Run[]): Run[] =>
    runs.some((r) => r.fn || (refs && (r.cite || r.xref)))
      ? runs.map((r) => {
          if (r.fn) return { ...r, t: String(nums.get(r.t) ?? r.t) };
          if (refs && (r.cite || r.xref)) {
            const { cite: _c, xref: _x, ...rest } = r;
            return { ...rest, t: refs.text(r) };
          }
          return r;
        })
      : runs;
  const runsMd = (runs: Run[], x: { table?: boolean; nl?: string; cm?: boolean } = {}) => runsMdOf(marks(runs), x);
  // The blocks something points to keep their ids ({#id}), for an agent.
  const targets = cm ? targetsOf(d) : new Set<string>();
  const idOf = (b: Block) => (targets.has(b.id) ? b.id : undefined);
  const bmKv = (b: { bm?: string }): Record<string, string> => (b.bm && !refs ? { bookmark: b.bm } : {});
  // A numbered caption: for a file, its label and number before its words.
  const captioned = (b: { id: string; label?: string; caption?: string }) => {
    const lab = refs && b.label ? refs.label(b.id) : null;
    return lab ? `${lab}${b.caption ? `: ${b.caption}` : ''}` : (b.caption ?? '');
  };
  const labelKv = (b: { label?: string }): Record<string, string> => (b.label && !refs ? { label: b.label } : {});
  // Where each level's item's words start, for the items under it.
  const content: number[] = [];
  let prev: Block | undefined;
  d.blocks.forEach((b, i) => {
    let s = '';
    if (b.type === 'p') {
      const style = b.style ?? 'normal';
      const align = b.align ? [b.align] : [];
      const kv = { ...(b.lvl ? { indent: b.lvl } : {}), ...spacingKv(b), ...marksKv(b, cm) };
      Object.assign(kv, bmKv(b));
      const id = idOf(b);
      if (style === 'code') {
        const text = runsText(b.runs);
        const fence = '`'.repeat(Math.max(3, ...(text.match(/`{3,}/g) ?? []).map((x) => x.length + 1)));
        s = `${fence}\n${text}\n${fence}`;
      } else if (style === 'quote') {
        const body = runsMd(b.runs, { nl: '\\\n> ', cm }) || '&nbsp;';
        s = `> ${body}${attrsMd({ id, cls: align, kv })}`;
      } else if (style === 'callout') {
        const body = runsMd(b.runs, { nl: '\\\n> ', cm }) || '&nbsp;';
        s = `> ${b.icon ?? CALLOUT.icon} ${body}${attrsMd({ id, cls: ['callout', ...align], kv: { ...kv, ...(b.tint ? { tint: b.tint } : {}) } })}`;
      } else {
        const lvl = headingLevel(style);
        const cls = [...(style === 'title' || style === 'subtitle' ? [style] : []), ...align];
        const body = runsMd(b.runs, { nl: '\\\n', cm });
        s = `${lvl ? `${'#'.repeat(lvl)} ` : ''}${body || (lvl ? '' : '&nbsp;')}${attrsMd({ id, cls, kv })}`;
      }
      content.length = 0;
    } else if (b.type === 'li') {
      const L = b.lvl ?? 0;
      const ind = L > 0 ? (content[Math.min(L, content.length) - 1] ?? 0) + Math.max(0, L - content.length) * 2 : 0;
      const mark = b.list === 'number' ? `${counts[i] || 1}.` : '-';
      const lead = `${' '.repeat(ind)}${mark} ${b.list === 'check' ? (b.checked ? '[x] ' : '[ ] ') : ''}`;
      content.length = L;
      content[L] = ind + mark.length + 1;
      s = `${lead}${runsMd(b.runs, { nl: `\\\n${' '.repeat(ind + mark.length + 1)}`, cm })}${attrsMd({ id: idOf(b), cls: b.align ? [b.align] : [], kv: { ...spacingKv(b), ...marksKv(b, cm), ...bmKv(b) } })}`;
    } else if (b.type === 'table' && (htmlTable(b) || (cm && (b.ins || b.del)))) {
      content.length = 0;
      s = `${tableCaption(b)}${tableHtml(b.rows.some((r) => r.some((c) => c.runs.some((x) => x.fn || (refs && (x.cite || x.xref))))) ? { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, runs: marks(c.runs) }))) } : b, { cm })}`;
    } else if (b.type === 'table') {
      content.length = 0;
      const n = b.rows[0]?.length ?? 0;
      const cell = (c: Cell) => runsMd(c.runs, { table: true, cm }) || ' ';
      const row = (r: Cell[]) => `| ${r.map(cell).join(' | ')} |`;
      const body = b.head ? b.rows.slice(1) : b.rows;
      const aligns = Array.from({ length: n }, (_, c) => {
        const tally = new Map<string, number>();
        for (const r of body.length ? body : b.rows) tally.set(r[c]?.align ?? 'left', (tally.get(r[c]?.align ?? 'left') ?? 0) + 1);
        return [...tally].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'left';
      });
      // Columns' widths as their dashes, as Pandoc reads them (equal ones say nothing): as many in all as say them best.
      let dashes: number[] = new Array(n).fill(3);
      if (b.cols) {
        let best = Infinity;
        for (let total = Math.max(30, 4 * n); total <= Math.max(150, 8 * n); total++) {
          const d = b.cols.map((w) => Math.max(3, Math.round(w * total)));
          const sum = d.reduce((a, x) => a + x, 0);
          const err = d.reduce((a, x, k) => a + Math.abs(x / sum - b.cols![k]), 0);
          if (err < best - 1e-9) {
            best = err;
            dashes = d;
          }
          if (err < 0.0004) break;
        }
      }
      const delim = `| ${dashes.map((x, c) => (aligns[c] === 'center' ? `:${'-'.repeat(Math.max(1, x - 2))}:` : aligns[c] === 'right' ? `${'-'.repeat(Math.max(1, x - 1))}:` : '-'.repeat(x))).join(' | ')} |`;
      const header = b.head ? b.rows[0] : Array.from({ length: n }, () => ({ runs: [] }) as Cell);
      s = tableCaption(b) + [row(header), delim, ...body.map(row)].join('\n');
    } else if (b.type === 'image') {
      content.length = 0;
      const alt = (b.alt ?? '').replace(/([\\[\]])/g, '\\$1');
      const src = /[()\s<>]/.test(b.src) ? `<${b.src}>` : b.src;
      const cap = captioned(b);
      const title = cap ? ` "${cap.replace(/(["\\])/g, '\\$1')}"` : '';
      const kv: Record<string, string> = { ...(b.w < 1 ? { width: `${Math.round(b.w * 1000) / 10}%` } : {}), ...marksKv(b, cm), ...labelKv(b) };
      s = `![${alt}](${src}${title})${attrsMd({ id: idOf(b), cls: b.align ? [b.align] : [], kv }).trimStart()}`;
    } else if (b.type === 'hr') {
      content.length = 0;
      s = '---';
    } else if (b.type === 'toc') {
      content.length = 0;
      s = o.tocLinks ? tocList(d) : '[TOC]';
    } else if (b.type === 'bib') {
      content.length = 0;
      // For a file, its entries as they read; for an agent, where it goes (drawn from the sources it cites).
      s = refs ? refs.bib().map((e) => runsMdOf(e)).filter(Boolean).join('\n\n') || '&nbsp;' : '[BIBLIOGRAPHY]';
    } else if (b.type === 'math') {
      content.length = 0;
      // For a file, a numbered equation's number as LaTeX's \tag (which KaTeX and MathJax draw at its right).
      const lab = refs && b.label ? refs.label(b.id) : null;
      const n = lab ? /\d+$/.exec(lab)?.[0] : undefined;
      s = `$$\n${b.tex.replace(/\$\$/g, '$ $')}${n ? ` \\tag{${n}}` : ''}\n$$${refs ? '' : attrsMd({ id: idOf(b), kv: labelKv(b) })}`;
    } else {
      content.length = 0;
      s = '\\pagebreak';
    }
    if (parts.length) parts.push(prev?.type === 'li' && b.type === 'li' ? '\n' : '\n\n');
    parts.push(s);
    prev = b;
  });
  // The footnotes, after the document: [^1]: their words (a line that goes on, indented).
  const notes = [...nums].flatMap(([id, n]) => {
    const note = d.notes?.find((x) => x.id === id);
    return note ? [`[^${n}]: ${runsMd(note.runs, { nl: '\\\n    ', cm }) || '&nbsp;'}`] : [];
  });
  if (notes.length) parts.push('\n\n', notes.join('\n'));
  return `${parts.join('')}\n`;

  /** A table's caption, a line before it (Table: …), and its label to number it. */
  function tableCaption(t: TableBlock): string {
    const cap = captioned(t);
    if (!cap && !idOf(t) && !t.label) return '';
    return `Table: ${escText(cap, false, false)}${refs ? '' : attrsMd({ id: idOf(t), kv: labelKv(t) })}\n\n`;
  }
}

// ---- HTML in -------------------------------------------------------------------------------------------------------

/** An element of HTML as read (its name in lower case, its attributes), or a piece of text. */
export type HNode = { tag: string; at: Record<string, string>; kids: HNode[] } | string;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'frame', 'keygen']);
/** What holds no document's words: left out with all it holds. */
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript', 'iframe', 'noembed', 'noframes', 'template', 'svg', 'math', 'object', 'canvas', 'select', 'video', 'audio', 'head']);
const CLOSES_P = new Set(
  'address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul li'.split(' '),
);

/** HTML as a tree, forgiving as browsers are: void elements, paragraphs and items closed by what comes next. */
export function parseHtml(html: string, maxNodes = 300_000): HNode[] {
  const root: Extract<HNode, object> = { tag: '#root', at: {}, kids: [] };
  const stack: Extract<HNode, object>[] = [root];
  const top = () => stack[stack.length - 1];
  let nodes = 0;
  const text = (t: string) => {
    if (!t) return;
    const kids = top().kids;
    const d = decodeEntities(t);
    if (typeof kids[kids.length - 1] === 'string') kids[kids.length - 1] += d;
    else kids.push(d);
  };
  /** Closes up to the nearest open `name` (none of `stop` between). */
  const closeTo = (names: string[], stop: string[] = []) => {
    for (let k = stack.length - 1; k > 0; k--) {
      if (names.includes(stack[k].tag)) {
        stack.length = k;
        return;
      }
      if (stop.includes(stack[k].tag)) return;
    }
  };
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const src = String(html ?? '');
  let at = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (++nodes > maxNodes) break;
    if (m.index > at) text(src.slice(at, m.index));
    at = re.lastIndex;
    if (m[1] !== undefined) {
      text(m[1]);
      continue;
    }
    const name = m[3]?.toLowerCase();
    if (!name) continue;
    if (m[2]) {
      if (name === 'p' && !stack.some((x) => x.tag === 'p')) continue;
      closeTo([name], name === 'li' ? ['ul', 'ol'] : name === 'td' || name === 'th' ? ['tr', 'table'] : name === 'tr' ? ['table'] : []);
      continue;
    }
    if (CLOSES_P.has(name)) closeTo(['p'], ['td', 'th', 'table', 'li', 'button', 'blockquote', 'div', 'section', 'article']);
    if (name === 'li') closeTo(['li'], ['ul', 'ol', 'table']);
    else if (name === 'td' || name === 'th') closeTo(['td', 'th'], ['tr', 'table']);
    else if (name === 'tr') closeTo(['tr'], ['table', 'tbody', 'thead', 'tfoot']);
    else if (name === 'dt' || name === 'dd') closeTo(['dt', 'dd'], ['dl']);
    else if (name === 'option') closeTo(['option'], ['select']);
    const el: Extract<HNode, object> = { tag: name, at: tagAttrs(m[4] ?? ''), kids: [] };
    top().kids.push(el);
    if (RAW.has(name) && !/\/\s*$/.test(m[4] ?? '')) {
      const end = new RegExp(`</${name}\\s*>`, 'i');
      const e = end.exec(src.slice(at));
      // Maths keeps the LaTeX it was written in, where it says it (KaTeX's and MathJax's do).
      if (name === 'math') {
        const tex = /<annotation[^>]*encoding\s*=\s*["']application\/x-tex["'][^>]*>([\s\S]*?)<\/annotation>/i.exec(src.slice(at, e ? at + e.index : undefined));
        if (tex) el.at['data-tex'] = decodeEntities(tex[1]).trim();
      }
      at = e ? at + e.index + e[0].length : src.length;
      re.lastIndex = at;
      continue;
    }
    if (!VOID.has(name) && !/\/\s*$/.test(m[4] ?? '')) stack.push(el);
  }
  if (at < src.length) text(src.slice(at));
  return root.kids;
}

const BLOCK = new Set(
  'p div section article header footer main address figure figcaption dd dt dl center aside details summary body html form fieldset legend caption hgroup nav blockquote pre h1 h2 h3 h4 h5 h6 ul ol li table hr'.split(' '),
);
const SKIP = new Set(['button', 'input', 'select', 'option', 'nav', 'map', 'area', 'datalist', 'dialog', 'colgroup', 'col', 'rp']);

export interface HtmlOpts {
  /** Colours, highlights, sizes and fonts kept too (a file opened), not only bold, italic, lines and links (a paste). */
  looks?: boolean;
  /** Spaces and line breaks kept as written (the editor reading its own paragraphs back), not as HTML folds them. */
  pre?: boolean;
}

interface Para {
  runs: Run[];
  props: Raw;
  /** An explicit <p>: kept when empty (Word's and Google Docs' empty lines). */
  keep: boolean;
}

/** Whether an element is not shown. */
function hiddenEl(at: Record<string, string>): boolean {
  if ('hidden' in at || at['aria-hidden'] === 'true') return true;
  const st = styleProps(at.style);
  return st.display === 'none' || st.visibility === 'hidden' || /^all$/i.test(st['mso-hide'] ?? '');
}

const textOfNode = (n: HNode): string => (typeof n === 'string' ? n : n.kids.map(textOfNode).join(''));

/**
 * Blocks from HTML (a page, or what is pasted from Word, Google Docs or the web): headings, paragraphs, lists
 * (checklists too), quotes, code, tables, pictures, rules and page breaks, with bold, italic, underline, struck,
 * raised and lowered words, code and links (and, with `looks`, colours, highlights, sizes and fonts). Everything
 * else is left out; nothing in it becomes markup. Blocks are as written, unchecked: normalizeBlocks checks them.
 */
export function htmlBlocks(input: string | HNode[], o: HtmlOpts = {}): Raw[] {
  const nodes = typeof input === 'string' ? parseHtml(input) : input;
  const out: Raw[] = [];
  const looks = !!o.looks;
  let cur: Para | null = null;
  let listDepth = 0;
  const flush = () => {
    const p = cur;
    cur = null;
    if (!p) return;
    const runs = mergeRuns(p.runs);
    // Words end where they end: the spaces after them are left out.
    if (!o.pre && runs.length) {
      const last = runs[runs.length - 1];
      runs[runs.length - 1] = { ...last, t: last.t.replace(/[ \t\n]+$/, '') };
    }
    const kept = mergeRuns(runs);
    if (!kept.length && !p.keep && p.props.type !== 'li') return;
    if (out.length >= DOC_LIMITS.blocks) return;
    out.push({ ...p.props, runs: kept });
  };
  const start = (props: Raw, keep = false) => {
    flush();
    cur = { runs: [], props, keep };
  };
  const addText = (t: string, look: Look, ctx: Ctx) => {
    if (!cur) cur = { runs: [], props: ctx.props(), keep: false };
    let s = t;
    if (!ctx.pre) {
      s = s.replace(/[\t\n\r\f ]+/g, ' ').replace(/\u00a0/g, ' ');
      const prev = cur.runs[cur.runs.length - 1]?.t ?? '';
      if (!prev || /[ \n]$/.test(prev)) s = s.replace(/^ /, '');
    }
    if (s) cur.runs.push({ t: s, ...look });
  };
  interface Ctx {
    look: Look;
    pre: boolean;
    props: () => Raw;
    /** Inside a list item's own words (a <p> in an <li> is part of it). */
    inItem: boolean;
    /** Inside a table's cell: blocks are lines of it. */
    cell: boolean;
  }

  const image = (at: Record<string, string>, ctx: Ctx) => {
    const st = styleProps(at.style);
    // A width in % is a share of the text's (as this app draws a picture); in pixels, of a page's 624.
    const pct = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(st.width ?? '');
    const w = pct ? 0 : Number(at.width) || parseFloat(st.width) || 0;
    const h = Number(at.height) || parseFloat(st.height) || 0;
    const alt = (at.alt ?? at.title ?? '').replace(/\s+/g, ' ').trim();
    // A small one among the words (an emoji, an icon) is its description, as is any picture in a table's cell.
    if (ctx.cell || (w && w < 24) || (h && h < 24) || /\bemoji\b/.test(at.class ?? '')) {
      if (alt && alt.length <= 40) addText(alt, ctx.look, ctx);
      return;
    }
    const src = docSrc(at.src);
    if (!src) return;
    const props = cur?.props;
    flush();
    out.push({ type: 'image', src, alt, w: pct ? Math.min(1, parseFloat(pct[1]) / 100) : w ? Math.min(1, w / 624) : 1, align: props?.align === 'right' ? 'right' : undefined });
  };
  // A document's own page (its web page opened again) has its sheets one after another: each after the first starts a page.
  let sheets = 0;

  const table = (el: Extract<HNode, object>, ctx: Ctx) => {
    flush();
    const rows: Raw[][] = [];
    let head = false;
    // Columns still taken by a cell merged down from a row above: how many rows more.
    const down: number[] = [];
    let widths: number[] = [];
    const walkRows = (n: Extract<HNode, object>, inHead: boolean) => {
      for (const k of n.kids) {
        if (typeof k === 'string') continue;
        if (k.tag === 'tr') {
          if (rows.length >= DOC_LIMITS.rows) return;
          const cells: Raw[] = [];
          const skip = () => {
            while (cells.length < DOC_LIMITS.cols && down[cells.length] > 0) {
              down[cells.length]--;
              cells.push({ runs: [] });
            }
          };
          for (const c of k.kids) {
            if (typeof c === 'string' || (c.tag !== 'td' && c.tag !== 'th') || hiddenEl(c.at)) continue;
            skip();
            // A cell's words: its blocks as lines.
            const inner = htmlBlocks(c.kids, o).map((b) => (Array.isArray(b.runs) ? (b.runs as Run[]) : []));
            const runs: Run[] = [];
            inner.forEach((r, j) => {
              if (j && r.length) runs.push({ t: '\n' });
              runs.push(...r);
            });
            const st = styleProps(c.at.style);
            const align = alignOf(c.at.align ?? st['text-align']);
            const cs = Math.max(1, Math.min(DOC_LIMITS.cols - cells.length, Math.round(Number(c.at.colspan)) || 1));
            const rs = Math.max(1, Math.min(DOC_LIMITS.rows, Math.round(Number(c.at.rowspan)) || 1));
            const va = (c.at.valign ?? st['vertical-align'] ?? '').toLowerCase();
            const fill = looks ? docColor(st['background-color'] ?? (st.background && !/url\(|gradient/i.test(st.background) ? st.background.split(/\s+/)[0] : undefined) ?? c.at.bgcolor) : null;
            const cell: Raw = { runs: mergeRuns(runs) };
            if (align && align !== 'left') cell.align = align;
            if (fill && fill !== '#ffffff') cell.fill = fill;
            if (va === 'middle' || va === 'center' || va === 'bottom') cell.va = va === 'bottom' ? 'bottom' : 'middle';
            if (cs > 1) cell.cs = cs;
            if (rs > 1) cell.rs = rs;
            cells.push(cell);
            for (let x = 0; x < cs; x++) {
              if (x) cells.push({ runs: [] });
              if (rs > 1) down[cells.length - 1] = rs - 1;
            }
            if (!rows.length && (c.tag === 'th' || inHead)) head = true;
          }
          skip();
          if (cells.length) rows.push(cells);
        } else if (k.tag === 'thead') walkRows(k, true);
        else if (k.tag === 'tbody' || k.tag === 'tfoot') walkRows(k, false);
        else if (k.tag === 'colgroup') widths = k.kids.flatMap((x) => (typeof x !== 'string' && x.tag === 'col' ? [parseFloat(styleProps(x.at.style).width ?? x.at.width ?? '') || 0] : []));
        else if (k.tag !== 'table' && k.tag !== 'caption') walkRows(k, inHead);
      }
    };
    walkRows(el, false);
    void ctx;
    const width = Math.max(0, ...rows.map((r) => r.length));
    if (rows.length) out.push({ type: 'table', rows, ...(head ? { head: true } : {}), ...(widths.length === width && widths.every((w) => w > 0) ? { cols: widths } : {}), ins: el.at['data-ins'], del: el.at['data-del'] });
  };

  const walk = (n: HNode, ctx: Ctx) => {
    if (out.length >= DOC_LIMITS.blocks) return;
    if (typeof n === 'string') return addText(n, ctx.look, ctx);
    const tag = n.tag;
    // Maths: an equation of its own when it is shown as one, alone; else among the words.
    const tex = (tag === 'math' || tag === 'span') && !hiddenEl(n.at) ? n.at['data-tex'] : undefined;
    if (tex) {
      if (tag === 'math' && n.at.display === 'block' && !ctx.cell && !ctx.inItem && !cur?.runs.some((r) => r.t.trim())) {
        flush();
        out.push({ type: 'math', tex });
      } else {
        if (!cur) cur = { runs: [], props: ctx.props(), keep: false };
        cur.runs.push(atomRun(tex, n.at['data-k']));
      }
      return;
    }
    const st = styleProps(n.at.style);
    // This app's own drawing first (its table of contents is a <nav>, which other pages' menus are).
    if (!ctx.cell && !ctx.inItem && !RAW.has(tag) && !hiddenEl(n.at) && ours(n, st, ctx)) return;
    if (RAW.has(tag) || SKIP.has(tag) || hiddenEl(n.at)) {
      // A ticked box in a list item says whether it is done.
      return;
    }
    if (/ignore/i.test(st['mso-list'] ?? '')) return;
    // A figure's caption is its picture's.
    if (tag === 'figcaption' && !ctx.cell) {
      const last = out[out.length - 1];
      const text = textOfNode(n).replace(/\s+/g, ' ').trim();
      if (last?.type === 'image' && !last.caption && text && !cur?.runs.some((r) => r.t.trim())) {
        last.caption = text;
        return;
      }
    }
    if (tag === 'br') {
      if ('data-ph' in n.at) return;
      if (/always|page/.test(st['page-break-before'] ?? st['break-before'] ?? '')) {
        flush();
        out.push({ type: 'pagebreak' });
        return;
      }
      if (!cur) cur = { runs: [], props: ctx.props(), keep: false };
      cur.runs.push({ t: '\n', ...ctx.look });
      return;
    }
    if (tag === 'img') return image(n.at, ctx);
    if (tag === 'hr') {
      if (ctx.cell) return;
      flush();
      out.push({ type: 'hr' });
      return;
    }
    if (tag === 'table') {
      if (ctx.cell) {
        addText(textOfNode(n), ctx.look, ctx);
        return;
      }
      return table(n, ctx);
    }
    if (/always|page/.test(st['page-break-before'] ?? st['break-before'] ?? '') && BLOCK.has(tag) && !ctx.cell) {
      flush();
      out.push({ type: 'pagebreak' });
    }
    if (!BLOCK.has(tag)) {
      const look = tagLook(tag, n.at, looks) ?? (() => {
        const m: Look = {};
        styleLook(st, m, looks);
        return m;
      })();
      const inner: Ctx = { ...ctx, look: { ...ctx.look, ...look } };
      for (const k of n.kids) walk(k, inner);
      return;
    }
    // A block: its own paragraph(s), what it says of its kind and alignment.
    const align = alignOf(n.at.align ?? st['text-align']);
    const cls = n.at.class ?? '';
    const props = (): Raw => {
      const base = ctx.props();
      const p: Raw = { ...base };
      if (align) p.align = align;
      return p;
    };
    const kidsCtx = (extra: Partial<Ctx>): Ctx => ({ ...ctx, ...extra });
    if (tag === 'ul' || tag === 'ol') {
      flush();
      listDepth++;
      const kind: ListKind = tag === 'ol' ? 'number' : 'bullet';
      const inner = kidsCtx({ inItem: false, props: () => ({ type: 'li', list: kind, lvl: Math.min(4, listDepth - 1) }) });
      for (const k of n.kids) walk(k, inner);
      flush();
      listDepth--;
      return;
    }
    if (tag === 'li') {
      const base = ctx.props();
      const lvlAttr = Number(n.at['aria-level']);
      const box = (function find(list: HNode[]): Extract<HNode, object> | undefined {
        for (const k of list) {
          if (typeof k === 'string' || k.tag === 'ul' || k.tag === 'ol') continue;
          if (k.tag === 'input' && /checkbox/i.test(k.at.type ?? '')) return k;
          const f = find(k.kids);
          if (f) return f;
        }
        return undefined;
      })(n.kids);
      const checkRole = n.at.role === 'checkbox';
      const p: Raw = base.type === 'li' ? { ...base } : { type: 'li', list: 'bullet', lvl: 0 };
      if (lvlAttr >= 1) p.lvl = Math.min(4, lvlAttr - 1);
      if (box || checkRole || /task-list-item|checklist/.test(cls)) {
        p.list = 'check';
        if ((box && 'checked' in box.at) || n.at['aria-checked'] === 'true') p.checked = true;
      }
      if (align) p.align = align;
      start(p, true);
      const inner = kidsCtx({ inItem: true, props: () => p });
      for (const k of n.kids) walk(k, inner);
      flush();
      return;
    }
    if (ctx.cell || ctx.inItem) {
      // Inside a cell or an item, a block is a line of it.
      if (cur && cur.runs.some((r) => r.t.trim()) && !/\n$/.test(cur.runs[cur.runs.length - 1].t)) cur.runs.push({ t: '\n' });
      const inner = kidsCtx({ pre: ctx.pre || tag === 'pre' });
      for (const k of n.kids) walk(k, inner);
      return;
    }
    let style: ParaStyle | undefined;
    if (/^h[1-6]$/.test(tag)) style = STYLE_OF[tag] as ParaStyle;
    else if (tag === 'pre') style = 'code';
    else if (/\bMsoTitle\b|\btitle\b/.test(cls) && tag === 'p') style = 'title';
    else if (/\bMsoSubtitle\b|\bsubtitle\b/.test(cls) && tag === 'p') style = 'subtitle';
    else if (/\bMso(Intense)?Quote\b/.test(cls)) style = 'quote';
    // Word's list paragraphs: a list by their style, their mark in a part to leave out.
    const wl = /level(\d+)/.exec(st['mso-list'] ?? '');
    if (wl && tag === 'p') {
      const mark = n.kids.map(function find(k: HNode): string {
        if (typeof k === 'string') return '';
        if (/ignore/i.test(styleProps(k.at.style)['mso-list'] ?? '')) return textOfNode(k);
        return k.kids.map(find).join('');
      }).join('').trim();
      const kind: ListKind = /^[☐☑☒□■]/.test(mark) ? 'check' : /^\(?[0-9a-zA-Z]{1,4}[.)]/.test(mark) ? 'number' : 'bullet';
      start({ type: 'li', list: kind, lvl: Math.min(4, Number(wl[1]) - 1), ...(mark.startsWith('☑') || mark.startsWith('☒') ? { checked: true } : {}), ...(align ? { align } : {}) }, true);
      for (const k of n.kids) walk(k, kidsCtx({ inItem: true, props: () => cur?.props ?? {} }));
      flush();
      return;
    }
    if (tag === 'blockquote') {
      flush();
      const inner = kidsCtx({ props: () => ({ ...props(), type: 'p', style: 'quote' }) });
      for (const k of n.kids) walk(k, inner);
      flush();
      return;
    }
    const indent = Math.round((ptOf(st['margin-left'] ?? st['padding-left'] ?? '') ?? 0) / 36);
    const mine = (): Raw => {
      const p = props();
      if (p.type !== 'li') p.type = 'p';
      if (style) p.style = style;
      else if (p.style === undefined && ctx.props().style) p.style = ctx.props().style;
      if (indent > 0 && p.type === 'p' && !style) p.lvl = Math.min(4, indent);
      // This app's own paragraph (its page opened again): its own spacing and indent, as it wrote them.
      if (/\bnd-b\b/.test(cls)) {
        Object.assign(p, ourSpacing(st));
        if (/\bnd-in\b/.test(cls) && Number(st['--lvl']) > 0) p.lvl = Math.min(4, Math.round(Number(st['--lvl'])));
      }
      return p;
    };
    const explicit = tag === 'p' || /^h[1-6]$/.test(tag) || tag === 'pre';
    start(mine(), explicit);
    // What the block's own style says of its words (a paragraph in red); a heading's weight is the heading's.
    const own: Look = { ...ctx.look };
    styleLook(st, own, looks);
    if (/^h[1-6]$/.test(tag)) delete own.b;
    const inner = kidsCtx({ pre: ctx.pre || tag === 'pre', props: mine, look: style === 'code' ? {} : own });
    for (const k of n.kids) walk(k, inner);
    flush();
  };

  /**
   * What this app draws a document's blocks as (its own web page, opened again), read back as those blocks: true when
   * `n` was one. Its sheets (each after the first a page break), list items, callouts and table of contents; the header
   * and footer on each sheet are the document's, not its words.
   */
  const ours = (n: Extract<HNode, object>, st: Record<string, string>, ctx: Ctx): boolean => {
    const cls = ` ${n.at.class ?? ''} `;
    if (!cls.includes(' nd-')) return false;
    if (cls.includes(' nd-band ')) return true;
    if (cls.includes(' nd-sheet ')) {
      flush();
      if (sheets++) out.push({ type: 'pagebreak' });
      for (const k of n.kids) walk(k, ctx);
      flush();
      return true;
    }
    if (n.tag === 'nav' && cls.includes(' nd-toc ')) {
      flush();
      out.push({ type: 'toc' });
      return true;
    }
    const align = alignOf(st['text-align']);
    const lvl = Math.min(4, Math.max(0, Math.round(Number(st['--lvl']) || 0)));
    let p: Raw | null = null;
    if (cls.includes(' nd-li ')) {
      const list: ListKind = cls.includes(' nd-number ') ? 'number' : cls.includes(' nd-check ') ? 'check' : 'bullet';
      p = { type: 'li', list, lvl, ...(list === 'check' && cls.includes(' nd-on ') ? { checked: true } : {}) };
    } else if (cls.includes(' nd-callout ')) p = { type: 'p', style: 'callout', icon: n.at['data-icon'], tint: st['--tint'] };
    if (!p) return false;
    if (align) p.align = align;
    Object.assign(p, ourSpacing(st));
    start(p, true);
    const props = p;
    for (const k of n.kids) walk(k, { ...ctx, inItem: true, props: () => props });
    flush();
    return true;
  };

  const rootCtx: Ctx = { look: {}, pre: !!o.pre, props: () => ({ type: 'p' }), inItem: false, cell: false };
  for (const n of nodes) walk(n, rootCtx);
  flush();
  // Empty lines at the start and the end, and more than one in a row, are left out.
  const blank = (b: Raw) => b.type === 'p' && !b.style && Array.isArray(b.runs) && !(b.runs as Run[]).some((r) => r.t.trim());
  const kept = out.filter((b, i) => !(blank(b) && (i === 0 || blank(out[i - 1]))));
  while (kept.length && blank(kept[kept.length - 1])) kept.pop();
  return kept;
}

/** A suggested change of look's old look, as an element carries it (JSON; checked where the run is). */
function wasOf(v: string | undefined): Look {
  try {
    const o = JSON.parse(v ?? '{}');
    return isObj(o) ? (o as Look) : {};
  } catch {
    return {};
  }
}

/** A thing of its own among the words, as the editor and runsInline draw one: maths, or (data-k) a footnote's mark, a citation, a cross-reference. */
const atomRun = (t: string, k: string | undefined): Run => (k === 'fn' ? { t, fn: true } : k === 'cite' ? { t, cite: true } : k === 'xref' ? { t, xref: true } : { t, math: true });

/** The runs of a paragraph's HTML (the editor's own, read back), its spaces and line breaks as written. */
export function htmlRuns(html: string): Run[] {
  const runs: Run[] = [];
  const walk = (n: HNode, look: Look) => {
    if (typeof n === 'string') {
      if (n) runs.push({ t: n, ...look });
      return;
    }
    if (n.tag === 'br') {
      if (!('data-ph' in n.at)) runs.push({ t: '\n', ...look });
      return;
    }
    // An equation drawn among the words: its LaTeX, not what KaTeX drew.
    if (n.at['data-tex']) {
      runs.push({ ...atomRun(n.at['data-tex'], n.at['data-k']), ...(look.cm ? { cm: look.cm } : {}), ...(look.ins ? { ins: look.ins } : {}), ...(look.del ? { del: look.del } : {}) });
      return;
    }
    if (RAW.has(n.tag) || n.tag === 'img') return;
    // A suggested change, as the editor draws it: words added, taken out, or with a new look (and their old one).
    const sid = cleanSid(n.at['data-s']);
    if (sid && (n.tag === 'ins' || n.tag === 'del' || n.tag === 'span')) {
      const m: Look = n.tag === 'ins' ? { ins: sid } : n.tag === 'del' ? { del: sid } : { fmt: sid, was: wasOf(n.at['data-was']) };
      for (const k of n.kids) walk(k, { ...look, ...m });
      return;
    }
    const m = tagLook(n.tag, n.at, true) ?? (() => {
      const x: Look = {};
      styleLook(styleProps(n.at.style), x, true);
      return x;
    })();
    // The comments the words carry, as the editor marks them.
    const cm = cleanCm(n.at['data-cm']);
    if (cm) m.cm = cm;
    // A block inside a paragraph (the browser's doing) is a line of it.
    if (BLOCK.has(n.tag) && runs.length && !runs[runs.length - 1].t.endsWith('\n')) runs.push({ t: '\n' });
    for (const k of n.kids) walk(k, { ...look, ...m });
  };
  for (const n of parseHtml(html)) walk(n, {});
  return cleanRuns(runs.map((r) => ({ ...r }) as unknown as Obj));
}

// ---- drawing a document as HTML -----------------------------------------------------------------------------

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** How maths is drawn: KaTeX's HTML for its LaTeX (display: an equation on a line of its own). */
export type MathDraw = (tex: string, display: boolean) => string;

/** A run as HTML: its words escaped (line breaks as <br>), wrapped in the elements its look asks for. */
/** A run's suggested change drawn around it: words added (underlined), taken out (struck), or with a new look (its old one on it, for the editor to read back). */
function suggestedHtml(r: Run, h: string, view: boolean): string {
  if (r.fmt) h = `<span class="nd-fmt" data-s="${escHtml(r.fmt)}"${view ? '' : ` data-was="${escHtml(JSON.stringify(r.was ?? {}))}"`}>${h}</span>`;
  if (r.ins) h = `<ins class="nd-ins" data-s="${escHtml(r.ins)}">${h}</ins>`;
  if (r.del) h = `<del class="nd-del" data-s="${escHtml(r.del)}">${h}</del>`;
  return h;
}

/** What a footnote's mark, a citation or a cross-reference shows, without the whole document to work it out from. */
const atomFallback = (r: Run) => (r.fn ? '*' : r.cite ? `(${citeItems(r.t).map((x) => x.key).join('; ')})` : '?');

function runHtml(r: Run, o: { view: boolean; math?: MathDraw; refs?: DocRefs }): string {
  if (r.math) {
    // Its LaTeX stays on it (what the editor reads back); in the editor it is one thing, not words to type in.
    const drawn = o.math ? o.math(r.t, false) : `<code>${escHtml(r.t)}</code>`;
    const h = suggestedHtml(r, `<span class="nd-m" data-tex="${escHtml(r.t)}"${o.view ? '' : ' contenteditable="false"'}>${drawn}</span>`, o.view);
    return !o.view && r.cm ? `<span data-cm="${escHtml(r.cm.join(' '))}">${h}</span>` : h;
  }
  // A footnote's mark (its number), a citation and a cross-reference (their words, worked out from the whole document):
  // what they keep on them (data-tex, as maths keeps its LaTeX) is what the editor reads back.
  const k = atomKind(r);
  if (k) {
    const text = k === 'fn' ? String(o.refs?.note(r.t) || '*') : (o.refs?.text(r) ?? atomFallback(r));
    let inner = escHtml(text);
    if (o.view && k === 'fn') inner = `<a href="#nd-fn-${escHtml(r.t)}">${inner}</a>`;
    else if (o.view && k === 'xref') inner = `<a href="#nd-${escHtml(r.t)}">${inner}</a>`;
    if (k === 'fn') inner = `<sup>${inner}</sup>`;
    const back = o.view && k === 'fn' ? ` id="nd-fn-${escHtml(r.t)}-ref"` : '';
    const h = suggestedHtml(r, `<span class="nd-x nd-${k}"${back} data-tex="${escHtml(r.t)}" data-k="${k}"${o.view ? '' : ' contenteditable="false"'}>${inner}</span>`, o.view);
    return !o.view && r.cm ? `<span data-cm="${escHtml(r.cm.join(' '))}">${h}</span>` : h;
  }
  let h = escHtml(r.t).replace(/\n/g, '<br>');
  if (r.code) h = `<code>${h}</code>`;
  if (r.sup) h = `<sup>${h}</sup>`;
  else if (r.sub) h = `<sub>${h}</sub>`;
  if (r.u) h = `<u>${h}</u>`;
  if (r.s) h = `<s>${h}</s>`;
  if (r.i) h = `<em>${h}</em>`;
  if (r.b) h = `<strong>${h}</strong>`;
  const st: string[] = [];
  if (r.color) st.push(`color:${r.color}`);
  if (r.hl) st.push(`background-color:${r.hl}`);
  if (r.size) st.push(`font-size:${r.size}pt`);
  if (r.font) st.push(`font-family:${fontCss(r.font)}`);
  if (st.length) h = `<span style="${escHtml(st.join(';'))}">${h}</span>`;
  // A link to a place in the document (a heading, a bookmark) leads to its block's element there.
  if (r.link?.startsWith('#')) h = `<a href="#nd-${escHtml(r.link.slice(1))}">${h}</a>`;
  else if (r.link) h = `<a href="${escHtml(r.link)}"${o.view ? ' target="_blank" rel="noopener noreferrer"' : ''}>${h}</a>`;
  h = suggestedHtml(r, h, o.view);
  // The comments on the words, marked in the editor (which shows the open ones' highlights); never on the page.
  if (!o.view && r.cm) h = `<span data-cm="${escHtml(r.cm.join(' '))}">${h}</span>`;
  return h;
}

/** Runs as HTML; an empty paragraph (or a line break at its end) keeps its line with a <br> (marked, in the editor). */
export function runsHtml(runs: Run[], o: { view?: boolean; math?: MathDraw; refs?: DocRefs } = {}): string {
  const view = !!o.view;
  const ph = view ? '<br>' : '<br data-ph="">';
  if (!runs.length) return ph;
  const h = runs.map((r) => runHtml(r, { view, math: o.math, refs: o.refs })).join('');
  return runs[runs.length - 1].t.endsWith('\n') && !isAtom(runs[runs.length - 1]) ? h + ph : h;
}

export interface DrawOpts {
  /** Where a picture's source shows from. */
  src: (s: string) => string;
  /** The editor's: blocks marked to be read back, the ones that hold no words not editable. */
  edit?: boolean;
  /** A page break's label (in the editor). */
  breakLabel?: string;
  /** Maths as HTML; without it, an equation shows its LaTeX. */
  math?: MathDraw;
  /** The headings a table of contents lists (tocEntries). */
  toc?: TocEntry[];
  /** What a table of contents says while there are no headings (in the editor). */
  tocHint?: string;
  /** Footnotes' numbers, citations, cross-references, numbered captions and the bibliography (doc-refs.ts docRefs). */
  refs?: DocRefs;
  /** What a bibliography says while the document cites nothing (in the editor). */
  bibHint?: string;
}

export interface TocEntry {
  id: string;
  level: number;
  text: string;
}

/** What a table of contents lists: the headings, levels 1 to 3, in order. */
export const tocEntries = (d: Doc): TocEntry[] => docHeadings(d).flatMap((h) => (h.level >= 1 && h.level <= 3 ? [{ id: h.id, level: h.level, text: h.text }] : []));

const TAG: Record<ParaStyle, string> = { normal: 'p', title: 'p', subtitle: 'p', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', quote: 'blockquote', code: 'pre', callout: 'div' };

/** A paragraph's own spacing as CSS. */
const spacingCss = (b: Spacing) => [b.lh !== undefined ? `line-height:${cssLine(b.lh)}` : '', b.sb !== undefined ? `margin-top:${b.sb}pt` : '', b.sa !== undefined ? `margin-bottom:${b.sa}pt` : ''];

/** A paragraph's own spacing read back from what spacingCss wrote (a document's own page opened again). */
function ourSpacing(st: Record<string, string>): Spacing {
  const out: Spacing = {};
  if (/^\s*\d+(\.\d+)?\s*$/.test(st['line-height'] ?? '')) out.lh = Math.round((parseFloat(st['line-height']) / 1.15) * 100) / 100;
  const pt = (v: string | undefined) => (v && /^\s*\d+(\.\d+)?pt\s*$/.test(v) ? parseFloat(v) : undefined);
  const sb = pt(st['margin-top']);
  const sa = pt(st['margin-bottom']);
  if (sb !== undefined) out.sb = sb;
  if (sa !== undefined) out.sa = sa;
  return out;
}

/** A block as HTML: `label` is a list item's mark (listInfo). Every word escaped; looks only from checked values. */
export function blockHtml(b: Block, label: string, o: DrawOpts): string {
  const view = !o.edit;
  // A block's own suggested change (its break, for a paragraph or an item): a bar in the colour of who suggested it.
  const sb = b.ins ?? b.del;
  const id = (o.edit ? ` data-b="${escHtml(b.id)}"` : '') + (sb ? ` data-s="${escHtml(sb)}"` : '');
  const sc = `${b.ins ? ' nd-sins' : ''}${b.del ? ' nd-sdel' : ''}`;
  const atom = o.edit ? ' contenteditable="false"' : '';
  const ro = { view, math: o.math, refs: o.refs };
  // On the document's own page, what links and cross-references lead to has an id: headings, bookmarks, numbered captions.
  const target = (yes: boolean) => (view && yes ? ` id="nd-${escHtml(b.id)}"` : '');
  // A bookmark's name, on its paragraph (the editor marks it beside it).
  const bm = (b.type === 'p' || b.type === 'li') && b.bm ? ` data-bm="${escHtml(b.bm)}"` : '';
  if (b.type === 'p') {
    const style = b.style ?? 'normal';
    const callout = style === 'callout';
    const st = [b.align ? `text-align:${b.align}` : '', b.lvl ? `--lvl:${b.lvl}` : '', ...spacingCss(b), callout && b.tint ? `--tint:${b.tint}` : ''].filter(Boolean).join(';');
    // Headings are where a table of contents' links lead, on the document's own page.
    const anchor = target(!!(headingLevel(style) || style === 'title' || b.bm));
    const icon = callout ? ` data-icon="${escHtml(b.icon ?? CALLOUT.icon)}"` : '';
    return `<${TAG[style]} class="nd-b nd-${style}${b.lvl ? ' nd-in' : ''}${sc}"${id}${anchor}${bm}${icon}${o.edit ? ' data-t=""' : ''}${st ? ` style="${st}"` : ''}>${runsHtml(b.runs, ro)}</${TAG[style]}>`;
  }
  if (b.type === 'li') {
    const st = [b.align ? `text-align:${b.align}` : '', `--lvl:${b.lvl ?? 0}`, ...spacingCss(b)].filter(Boolean).join(';');
    return `<p class="nd-b nd-li nd-${b.list}${b.checked ? ' nd-on' : ''}${sc}"${id}${target(!!b.bm)}${bm}${o.edit ? ' data-t=""' : ''} data-n="${escHtml(label)}" style="${st}">${runsHtml(b.runs, ro)}</p>`;
  }
  if (b.type === 'table') {
    const n = b.rows[0]?.length ?? 0;
    const cols = b.cols ?? new Array(n).fill(1 / Math.max(1, n));
    // The cells a merged one covers are not drawn.
    const covered = new Set<string>();
    b.rows.forEach((r, ri) => r.forEach((c, ci) => {
      for (let y = 0; y < (c.rs ?? 1); y++) for (let x = 0; x < (c.cs ?? 1); x++) if (y || x) covered.add(`${ri + y},${ci + x}`);
    }));
    const row = (r: Cell[], ri: number, th: boolean) =>
      `<tr>${r
        .map((c, ci) => {
          if (covered.has(`${ri},${ci}`)) return '';
          const tag = th ? 'th' : 'td';
          const st = [c.align ? `text-align:${c.align}` : '', c.fill ? `background-color:${c.fill}` : '', c.va ? `vertical-align:${c.va}` : ''].filter(Boolean).join(';');
          const span = `${c.cs ? ` colspan="${c.cs}"` : ''}${c.rs ? ` rowspan="${c.rs}"` : ''}`;
          return `<${tag}${o.edit ? ` data-c="${ri},${ci}" data-t=""` : ''}${span}${st ? ` style="${st}"` : ''}>${runsHtml(c.runs, ro)}</${tag}>`;
        })
        .join('')}</tr>`;
    const head = b.head && b.rows.length ? `<thead>${row(b.rows[0], 0, true)}</thead>` : '';
    const body = b.rows.map((r, ri) => (b.head && ri === 0 ? '' : row(r, ri, false))).join('');
    // Its caption over it (with its label and number: "Table 2: …"), a thing of its own in the editor (clicked to change).
    const words = captionWords(b, o.refs);
    const cap = words ? `<caption class="nd-cap"${atom}>${escHtml(words)}</caption>` : '';
    return `<table class="nd-b nd-table${sc}"${id}${target(!!b.label)}>${cap}<colgroup>${cols.map((w) => `<col style="width:${Math.round(w * 10000) / 100}%">`).join('')}</colgroup>${head}<tbody>${body}</tbody></table>`;
  }
  if (b.type === 'image') {
    const words = captionWords(b, o.refs);
    const cap = words ? `<figcaption>${escHtml(words)}</figcaption>` : '';
    const img = `<img src="${escHtml(o.src(b.src))}" alt="${escHtml(b.alt ?? '')}" style="width:${Math.round(b.w * 1000) / 10}%"${o.edit ? ' draggable="false"' : ''}>`;
    return `<figure class="nd-b nd-img nd-${b.align ?? 'center'}${sc}"${id}${target(!!b.label)}${atom}>${img}${cap}</figure>`;
  }
  if (b.type === 'hr') return `<div class="nd-b nd-hr${sc}"${id}${atom}><hr></div>`;
  if (b.type === 'toc') {
    const list = o.toc ?? [];
    // On the page, links to the headings; in the editor, lines it goes to on a click (no address of the app's changes).
    const lines = list.map((h) => `<a class="nd-toc-${h.level}"${view ? ` href="#nd-${escHtml(h.id)}"` : ''} data-h="${escHtml(h.id)}">${escHtml(h.text)}</a>`).join('');
    return `<nav class="nd-b nd-toc${sc}"${id}${atom}>${lines || (o.tocHint ? `<span class="nd-toc-hint">${escHtml(o.tocHint)}</span>` : '')}</nav>`;
  }
  if (b.type === 'math') {
    // A numbered equation's number, at its right: "(3)".
    const n = b.label ? /\d+$/.exec(o.refs?.label(b.id) ?? '')?.[0] : undefined;
    const num = n ? `<span class="nd-eqn">(${n})</span>` : '';
    return `<div class="nd-b nd-math${n ? ' nd-numbered' : ''}${sc}"${id}${target(!!b.label)}${atom}>${o.math ? o.math(b.tex, true) : `<code>${escHtml(b.tex)}</code>`}${num}</div>`;
  }
  if (b.type === 'bib') {
    // The bibliography's entries, each a paragraph that hangs (or, numbered, its number in a column of its own).
    const entries = o.refs?.bib() ?? [];
    const num = (e: Run[]) => /^\[\d+\]$/.test(e[0]?.t ?? '');
    const lines = entries.map((e) => (num(e) ? `<p class="nd-bib-e nd-bib-n"><span>${escHtml(e[0].t)}</span><span>${runsHtml(e.slice(1).map((r, k) => (k === 0 ? { ...r, t: r.t.replace(/^\s+/, '') } : r)), { view: true })}</span></p>` : `<p class="nd-bib-e">${runsHtml(e, { view: true })}</p>`));
    return `<div class="nd-b nd-bib${sc}"${id}${atom}>${lines.join('') || (o.bibHint ? `<span class="nd-toc-hint">${escHtml(o.bibHint)}</span>` : '')}</div>`;
  }
  return `<div class="nd-b nd-pb${sc}"${id}${atom}${o.breakLabel ? ` data-label="${escHtml(o.breakLabel)}"` : ''}></div>`;
}

/** A picture's or table's caption as it reads: its label and number first when it is numbered ("Figure 2: …"). */
export function captionWords(b: ImageBlock | TableBlock, refs?: DocRefs): string {
  const lab = b.label ? (refs?.label(b.id) ?? b.label) : '';
  return lab ? (b.caption ? `${lab}: ${b.caption}` : lab) : (b.caption ?? '');
}

/**
 * A document's footnotes as HTML, in their marks' order: each its number and words (on the document's own page, with
 * a link back to its mark). `ids`: their elements say which note they are (the editor's notes at a page's foot).
 */
export function notesHtml(d: Doc, refs: DocRefs | undefined, o: { view?: boolean; math?: MathDraw; ids?: string[] } = {}): string {
  const list = (o.ids ?? (d.notes ?? []).map((n) => n.id)).flatMap((id) => {
    const n = d.notes?.find((x) => x.id === id);
    return n ? [n] : [];
  });
  if (!list.length) return '';
  const view = !!o.view;
  const items = list.map((n) => {
    const num = refs?.note(n.id) || '';
    const back = view ? `<a href="#nd-fn-${escHtml(n.id)}-ref" aria-label="Back">${num}</a>` : String(num);
    return `<p class="nd-note"${view ? ` id="nd-fn-${escHtml(n.id)}"` : ''} data-note="${escHtml(n.id)}"><span class="nd-note-n">${back}</span><span class="nd-note-t">${runsHtml(n.runs, { view: true, math: o.math, refs })}</span></p>`;
  });
  return `<div class="nd-notes">${items.join('')}</div>`;
}

const CHECK_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='white' " +
  "stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

/**
 * How a document's words look, under `scope`: its font and size, each kind of paragraph, lists' marks, tables,
 * pictures, quotes and code; the same in the editor, the document's own page and its PDF. Only checked values go in
 * (a font's name is letters, digits, spaces and dashes).
 */
export function docCss(d: Doc, scope = '.nd-doc'): string {
  const s = (sel: string) =>
    sel
      .split(',')
      .map((x) => `${scope} ${x.trim()}`)
      .join(',');
  const rule = (sel: string, body: string) => `${s(sel)}{${body}}`;
  // Each style as the document has it: the app's, with the document's own changes (styleOf).
  const styleRules = (Object.keys(STYLES) as ParaStyle[])
    .filter((k) => k !== 'normal')
    .map((k) => {
      const v = styleOf(d, k);
      const own = d.styles?.[k];
      const more = `${v.font ? `;font-family:${k === 'code' ? `${fontCss(v.font)},${MONO}` : fontCss(v.font)}` : ''}${own?.align ? `;text-align:${own.align}` : ''}${own?.i === false ? ';font-style:normal' : ''}`;
      return rule(`.nd-${k}`, `font-size:${v.k}em;line-height:${v.lh};margin:${v.before}em 0 ${v.after}em;color:${v.color};font-weight:${v.bold ? 700 : 400}${v.italic ? ';font-style:italic' : ''}${more}`);
    });
  // Normal text's own look: its colour and lines for all the words; its spacing, weight, slant and alignment for its paragraphs.
  const normal = d.styles?.normal;
  const N = styleOf(d, 'normal');
  const normalRule = normal
    ? [rule('.nd-normal', [`margin:${N.before}em 0 ${N.after}em`, normal.b ? 'font-weight:700' : '', normal.i ? 'font-style:italic' : '', normal.align ? `text-align:${normal.align}` : ''].filter(Boolean).join(';'))]
    : [];
  return [
    `${scope}{font-family:${fontCss(d.font)};font-size:${d.size}pt;line-height:${N.lh};color:${normal?.color ?? INK};--nd-step:36pt;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-kerning:normal}`,
    rule('.nd-b', `margin:0 0 ${STYLES.normal.after}em;white-space:pre-wrap;overflow-wrap:break-word;tab-size:4`),
    ...normalRule,
    rule('.nd-b:first-child', 'margin-top:0'),
    rule('.nd-in', 'margin-left:calc(var(--lvl,0)*var(--nd-step))'),
    ...styleRules,
    rule('.nd-title', 'letter-spacing:-.01em'),
    rule('blockquote.nd-b', `border-left:3px solid #d0d7de;padding-left:.9em;margin-right:0`),
    rule('blockquote.nd-in', 'margin-left:calc(var(--lvl,0)*var(--nd-step))'),
    rule('pre.nd-b', `font-family:${MONO};background:#f6f8fa;border:1px solid #e5e9ee;border-radius:6px;padding:.7em .9em`),
    rule('.nd-li', `position:relative;margin:0 0 .25em;padding-left:calc(var(--lvl,0)*var(--nd-step) + 1.6em)`),
    rule('.nd-li::before', 'content:attr(data-n);position:absolute;left:calc(var(--lvl,0)*var(--nd-step));width:1.5em;white-space:nowrap;text-align:left'),
    rule('.nd-bullet::before', 'text-align:center;width:1.1em'),
    rule('.nd-check::before', 'content:"";top:.22em;width:.95em;height:.95em;border:1.5px solid #80868b;border-radius:3px;box-sizing:border-box'),
    rule('.nd-check.nd-on::before', `background:#1a73e8 ${CHECK_SVG} center/85% no-repeat;border-color:#1a73e8`),
    rule('.nd-check.nd-on', 'color:#80868b;text-decoration:line-through'),
    rule('.nd-li + .nd-b:not(.nd-li)', 'margin-top:.6em'),
    rule('table.nd-table', 'border-collapse:collapse;width:100%;table-layout:fixed;margin:.3em 0 .9em'),
    rule('.nd-table td, .nd-table th', 'border:1px solid #d0d7de;padding:.35em .55em;vertical-align:top;text-align:left;font-weight:inherit;white-space:pre-wrap;overflow-wrap:break-word;line-height:1.35'),
    rule('.nd-table thead th', 'background:#f3f5f7;font-weight:700'),
    rule('figure.nd-img', 'margin:.4em 0 .9em'),
    rule('.nd-img img', 'display:block;max-width:100%;height:auto;margin:0 auto'),
    rule('.nd-left img', 'margin-left:0'),
    rule('.nd-right img', 'margin-right:0'),
    rule('.nd-img figcaption', 'margin-top:.45em;font-size:.88em;line-height:1.35;color:#5f6368;text-align:center'),
    rule('.nd-left figcaption', 'text-align:left'),
    rule('.nd-right figcaption', 'text-align:right'),
    rule('.nd-hr', 'padding:.5em 0;margin:0 0 .6em'),
    rule('.nd-hr hr', 'border:0;border-top:1px solid #c8ccd1;margin:0'),
    rule('a', 'color:#1a5fd8;text-decoration:underline'),
    rule('code', `font-family:${MONO};font-size:.9em;background:#f1f3f5;border-radius:4px;padding:.08em .3em`),
    rule('pre code', 'background:none;padding:0;font-size:1em'),
    rule('sup, sub', 'font-size:.72em;line-height:0'),
    rule('.nd-callout', `background:var(--tint,${CALLOUT.tint});border-radius:8px;padding:.75em 1em .75em 2.8em;position:relative;font-style:normal`),
    rule('.nd-callout::before', 'content:attr(data-icon);position:absolute;left:.8em;top:.75em;width:1.4em;text-align:center;font-size:1.05em;line-height:1.35'),
    rule('.nd-toc', 'margin:.2em 0 1em;padding:.1em 0'),
    rule('.nd-toc a', `display:block;color:${INK};text-decoration:none;padding:.14em 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`),
    rule('.nd-toc .nd-toc-1', 'font-weight:600'),
    rule('.nd-toc .nd-toc-2', 'padding-left:1.4em'),
    rule('.nd-toc .nd-toc-3', 'padding-left:2.8em;color:#3c4043'),
    rule('.nd-toc-hint', 'color:#80868b;font-style:italic'),
    rule('.nd-math', 'margin:.5em 0 1em;text-align:center;overflow-x:auto;overflow-y:hidden;white-space:normal'),
    rule('.nd-math .katex-display', 'margin:0'),
    rule('.nd-m', 'white-space:nowrap'),
    rule('.nd-m .katex', 'font-size:1.1em'),
    // Suggested changes, in the colour of who suggested each (--sc): words added underlined, words taken out struck,
    // a new look dotted under; a block's own, a bar at its side (a block to take out, faded too).
    rule('ins.nd-ins', 'color:var(--sc,#188038);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px'),
    rule('del.nd-del', 'color:var(--sc,#c5221f);text-decoration:line-through;text-decoration-thickness:1px'),
    rule('.nd-fmt', 'text-decoration:underline dotted;text-decoration-color:var(--sc,#1a73e8);text-underline-offset:3px'),
    rule('.nd-sins, .nd-sdel', 'box-shadow:-7px 0 0 -4px var(--sc,#1a73e8)'),
    // Footnotes' marks, citations and cross-references; a table's caption over it, an equation's number at its right,
    // the bibliography's entries (hanging, or numbered in a column), and the footnotes at a page's foot (or the end).
    rule('.nd-x', 'white-space:nowrap'),
    rule('.nd-x a', 'color:inherit;text-decoration:none'),
    rule('.nd-table caption.nd-cap', 'caption-side:top;text-align:left;font-size:.88em;line-height:1.35;color:#5f6368;padding:0 0 .4em;white-space:pre-wrap;overflow-wrap:break-word'),
    rule('.nd-math.nd-numbered', 'position:relative;padding:0 3.2em'),
    rule('.nd-eqn', 'position:absolute;right:0;top:50%;transform:translateY(-50%)'),
    rule('.nd-bib', 'margin:.2em 0 1em'),
    rule('.nd-bib-e', 'margin:0 0 .6em;padding-left:2.2em;text-indent:-2.2em;white-space:pre-wrap;overflow-wrap:anywhere'),
    rule('.nd-bib-n', 'display:grid;grid-template-columns:2.8em 1fr;padding-left:0;text-indent:0'),
    rule('.nd-notes', 'font-size:.82em;line-height:1.4;color:#3c4043'),
    rule('.nd-note', 'display:flex;gap:.4em;margin:0 0 .3em;white-space:pre-wrap;overflow-wrap:break-word'),
    rule('.nd-note-n', 'flex:none;min-width:1.2em;text-align:right;font-size:.8em;line-height:1.9'),
    rule('.nd-note-n a', 'color:inherit;text-decoration:none'),
    rule('.nd-note-t', 'min-width:0;flex:1'),
    rule('figure.nd-sdel, table.nd-sdel, .nd-hr.nd-sdel, .nd-toc.nd-sdel, .nd-math.nd-sdel, .nd-pb.nd-sdel', 'opacity:.5'),
  ].join('\n');
}
