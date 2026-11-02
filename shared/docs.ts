// Documents: a document kept in Pages (a page of the kind "doc"), as the server, the editor and the exports share
// it, made as in Word or Google Docs: a paper size and margins, the document's own font and size, and blocks one
// after another: paragraphs (normal text, a title, a subtitle, headings, quotes, code), list items (bullets, numbers,
// checklists, five levels deep), tables, pictures, lines across and page breaks. Words are runs of text with their
// look: bold, italic, underlined, struck, code, raised or lowered, a colour, a highlight, a size, a font, a link.
//
// normalizeDoc takes what an agent, the editor or an imported file gives (Markdown, lenient blocks, or the model as
// it is kept) and returns the model with every value checked: the editor shows documents inside the app itself, so
// nothing in one may be markup, a script or a style rule; colours, fonts, sizes and addresses are each of a known
// form. docMarkdown writes it back as Markdown, with a few additions for what plain Markdown cannot say; htmlBlocks
// reads HTML (a page, or what is pasted from Word, Google Docs or the web) into blocks; blockHtml draws a block
// for the editor and for the document's own page alike, every word escaped.
import { cleanColor, cleanFont, COLOR_REFS, fontCss, FONTS, hexColor, newId, THEMES } from './slides.ts';

export { FONTS, fontCss, newId };

export const DOC_LIMITS = { blocks: 20000, runs: 4000, text: 200_000, rows: 500, cols: 30, caption: 1000, levels: 5 };

/** A picture kept by the app (server/pages/assets.ts), by its content's hash: "naget-asset:<sha>". */
export const ASSET = 'naget-asset:';

export type Align = 'left' | 'center' | 'right' | 'justify';
export type ParaStyle = 'normal' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3' | 'h4' | 'quote' | 'code';
export type ListKind = 'bullet' | 'number' | 'check';
export type PaperSize = 'a4' | 'letter';

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
}

/** What a run looks like, without its words. */
export type Look = Omit<Run, 't'>;

export interface ParaBlock {
  id: string;
  type: 'p';
  /** Normal text when left out. */
  style?: Exclude<ParaStyle, 'normal'>;
  align?: Align;
  /** Indent, 0–4 steps. */
  lvl?: number;
  runs: Run[];
}

export interface ItemBlock {
  id: string;
  type: 'li';
  list: ListKind;
  /** A checklist's item, ticked. */
  checked?: boolean;
  /** How deep in the list, 0–4. */
  lvl?: number;
  align?: Align;
  runs: Run[];
}

export interface Cell {
  /** Its words; "\n" breaks a line. */
  runs: Run[];
  align?: Align;
}

export interface TableBlock {
  id: string;
  type: 'table';
  /** The first row is a header (shaded, repeated on each printed page). */
  head?: boolean;
  /** The columns' widths, as shares of the table's (they add up to 1). */
  cols?: number[];
  rows: Cell[][];
}

export interface ImageBlock {
  id: string;
  type: 'image';
  src: string;
  /** Its width, as a share of the text's width (0.05–1). */
  w: number;
  /** Centred when left out. */
  align?: 'left' | 'center' | 'right';
  caption?: string;
  /** What it shows, for those who cannot see it. */
  alt?: string;
}

export interface RuleBlock {
  id: string;
  type: 'hr';
}

export interface BreakBlock {
  id: string;
  type: 'pagebreak';
}

export type Block = ParaBlock | ItemBlock | TableBlock | ImageBlock | RuleBlock | BreakBlock;
export type TextBlock = ParaBlock | ItemBlock;
export type BlockType = Block['type'];

export interface Page {
  size: PaperSize;
  /** Millimetres, on every side. */
  margin: number;
}

export interface Doc {
  v: 1;
  page: Page;
  /** The body text's font and its size in points; headings are sized from it. */
  font: string;
  size: number;
  blocks: Block[];
}

// ---- how documents look --------------------------------------------------------------------------------

/** Paper, in millimetres. */
export const PAPERS: Record<PaperSize, { w: number; h: number; label: string }> = {
  a4: { w: 210, h: 297, label: 'A4' },
  letter: { w: 215.9, h: 279.4, label: 'US Letter' },
};

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
};

export const PARA_STYLES: ParaStyle[] = ['normal', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'quote', 'code'];
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

/** A numbered item's mark at a level: 1. a. i. as Word numbers them. */
export const numberLabel = (n: number, lvl: number) => `${lvl % 3 === 0 ? n : lvl % 3 === 1 ? letters(n) : roman(n)}.`;

/**
 * Each block's list mark ("3.", "b.", "•"; '' for others and checklists) and, for numbered items, which list it
 * counts in (a list starts again after anything that is not a list item, and where another kind of item comes
 * at its level).
 */
export function listInfo(blocks: Block[]): { labels: string[]; groups: number[]; counts: number[] } {
  const labels: string[] = new Array(blocks.length).fill('');
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
    if (kind[L] !== b.list || count[L] === undefined) {
      count[L] = 0;
      kind[L] = b.list;
      group[L] = ++next;
    }
    count[L]++;
    labels[i] = b.list === 'number' ? numberLabel(count[L], L) : b.list === 'bullet' ? BULLETS[L % 3] : '';
    groups[i] = group[L];
    counts[i] = count[L];
  });
  return { labels, groups, counts };
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

/** An address words may open: the web, mail, a phone number (www. is the web). */
export function docLink(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  let s = v.trim();
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

/** Whether two runs look the same. */
export const sameLook = (a: Look, b: Look) => LOOK_KEYS.every((k) => a[k] === b[k]);

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
    if (last && sameLook(last, r)) out[out.length - 1] = { ...last, t: last.t + r.t };
    else out.push(r);
  }
  return out;
}

export const runsText = (runs: Run[]) => runs.map((r) => r.t).join('');

/** A run checked: its words and its look, every value of a known form. */
function cleanRun(r: Obj, t: string): Run {
  const out: Run = { t };
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

function para(v: Obj, style: ParaStyle, used: Set<string>, words: unknown): ParaBlock {
  const b = { id: cleanId(v.id, used), type: 'p' } as ParaBlock;
  if (style !== 'normal') b.style = style;
  const align = alignOf(v.align);
  if (align && align !== 'left') b.align = align;
  const lvl = Math.round(num(v.lvl ?? v.indent ?? v.level, 0, 4, 0));
  if (lvl && style !== 'title' && style !== 'subtitle' && !headingLevel(style)) b.lvl = lvl;
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
    return c;
  }
  return { runs: v === null || v === undefined ? [] : cleanRuns(typeof v === 'string' ? v.replace(/<br\s*\/?>/gi, '\n') : String(v)) };
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
  const t = { id: cleanId(v.id, used), type: 'table' } as TableBlock;
  if (v.head === true || v.header === true || (v.head === undefined && v.header === undefined && headDefault)) t.head = true;
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
  const alt = oneLine(v.alt, DOC_LIMITS.caption);
  if (alt) b.alt = alt;
  return b;
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
  const push = (b: Block | null) => {
    if (b && out.length < DOC_LIMITS.blocks) out.push(b);
  };
  if (type) {
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
    return;
  }
  // Shorthands: { image: "…" }, { table: [[…]] }, { bullets: ["…", ["…"]] }, { bullet: "…" }, { h2: "Pricing" }.
  if (typeof v.image === 'string' || typeof v.img === 'string' || (typeof v.src === 'string' && v.text === undefined)) return push(image(v, v.image ?? v.img ?? v.src, used, o));
  if (Array.isArray(v.table)) return push(table(v, v.table, used, true));
  if (Array.isArray(v.rows)) return push(table(v, v.rows, used, true));
  if (v.hr === true || v.rule === true || v.line === true || v.divider === true) return push({ id: cleanId(v.id, used), type: 'hr' });
  if (v.pagebreak === true || v.pageBreak === true || v.newpage === true) return push({ id: cleanId(v.id, used), type: 'pagebreak' });
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
  const size = pick(String(pg.size ?? pg.paper ?? v.paper ?? '').toLowerCase(), ['a4', 'letter'] as const) ?? DOC_DEFAULTS.page.size;
  const margin = Math.min(60, Math.max(5, Math.round((mmOf(pg.margin ?? v.margin) ?? DOC_DEFAULTS.page.margin) * 10) / 10));
  const used = new Set<string>();
  const blocks = typeof v.markdown === 'string' && !Array.isArray(v.blocks) ? normalizeBlocks(mdBlocks(v.markdown), o, used) : normalizeBlocks(v.blocks as unknown[], o, used);
  if (!blocks.length) blocks.push({ id: cleanId(undefined, used), type: 'p', runs: [] });
  return { v: 1, page: { size, margin }, font: docFont(v.font) ?? DOC_DEFAULTS.font, size: ptOf(v.size, 6, 72) ?? DOC_DEFAULTS.size, blocks };
}

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
  const out: string[] = [`{"v":1,"page":${JSON.stringify(d.page)},"font":${JSON.stringify(d.font)},"size":${d.size},"blocks":[`];
  d.blocks.forEach((b, i) => {
    const end = i < d.blocks.length - 1 ? ',' : '';
    if (b.type === 'table') {
      const { rows, ...rest } = b;
      out.push(` ${JSON.stringify(rest).slice(0, -1)},"rows":[`);
      rows.forEach((r, j) => out.push(`  ${JSON.stringify(r)}${j < rows.length - 1 ? ',' : ''}`));
      out.push(` ]}${end}`);
    } else out.push(` ${JSON.stringify(b)}${end}`);
  });
  out.push(']}');
  return out.join('\n');
}

/** Whether stored page text is a document (rather than a page's HTML or another kind's model). */
export const isDocText = (s: string) => /^\s*\{\s*"v"\s*:\s*1\s*,\s*"page"/.test(s);

/** A block's words as plain text (a table's, a cell a tab and a row a line; a picture's caption). */
export function blockText(b: Block): string {
  if (b.type === 'p' || b.type === 'li') return runsText(b.runs);
  if (b.type === 'table') return b.rows.map((r) => r.map((c) => runsText(c.runs).replace(/\n/g, ' ')).join('\t')).join('\n');
  if (b.type === 'image') return b.caption ?? b.alt ?? '';
  return '';
}

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

/** The fonts a document uses: its own and its words'. */
export function docFonts(d: Doc): string[] {
  const names = new Set<string>([d.font]);
  const add = (runs: Run[]) => {
    for (const r of runs) if (r.font) names.add(r.font);
  };
  for (const b of d.blocks) {
    if (b.type === 'p' || b.type === 'li') add(b.runs);
    else if (b.type === 'table') for (const r of b.rows) for (const c of r) add(c.runs);
  }
  return [...names];
}

/** The pictures a document shows. */
export const docSources = (d: Doc) => d.blocks.flatMap((b) => (b.type === 'image' && b.src ? [b.src] : []));

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
}

const KNOWN_CLS = new Set(['title', 'subtitle', 'left', 'center', 'centre', 'right', 'justify']);
const KNOWN_KV = new Set(['indent', 'align', 'width', 'w']);

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
    else if (m[3]) a.kv[m[3].toLowerCase()] = m[4] ?? m[5] ?? m[6] ?? '';
    i = re.lastIndex;
  }
  return a.cls.some((c) => KNOWN_CLS.has(c)) || Object.keys(a.kv).some((k) => KNOWN_KV.has(k)) ? a : null;
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
    case 'ins':
      m.u = true;
      break;
    case 's':
    case 'del':
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
      const link = docLink(at.href);
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
    case 'span':
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
    if (m.link || m.code || !/https?:\/\/|www\./.test(t)) return void out.push({ t, ...m });
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
const startsBlock = (l: string) => FENCE.test(l) || ATX.test(l) || RULE.test(l) || QUOTE.test(l) || ITEM.test(l) || PAGEBREAK.test(l);

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
  }
  if (!alone && (runs.some((r) => r.t) || !imgs.length)) out.push({ ...b, runs });
  for (const im of imgs) {
    const a = alone ? attrs : im.attrs;
    out.push({ type: 'image', src: im.src, alt: im.alt, caption: im.title, w: a?.kv.width ?? a?.kv.w ?? im.width, align: attrsAlign(a) });
  }
}

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
      const inner = depth < 4 ? mdBlocks(body.join('\n'), depth + 1) : [{ type: 'p', runs: mdRuns(body.join(' ')) }];
      for (const b of inner) out.push(b.type === 'p' && b.style !== 'code' ? { ...b, style: 'quote' } : b);
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
  return out;
}

// ---- Markdown out ---------------------------------------------------------------------------------------------

/** Text written so Markdown reads it as text: what would be syntax escaped (at a line's start too, with `start`). */
function escText(t: string, start: boolean, table: boolean): string {
  let out = '';
  const alnum = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    const lone = (i === 0 || SPACE.test(t[i - 1])) && (i === t.length - 1 || SPACE.test(t[i + 1]));
    if (ch === '\\' || ch === '`' || ch === '[' || ch === ']') out += `\\${ch}`;
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
function marksOf(r: Look, tags: boolean): string[] {
  const k: string[] = [];
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
  const common = (a: Run, b: Run | undefined): Look => {
    const m: Look = {};
    if (!b) return m;
    for (const k of LOOK_KEYS) if (a[k] !== undefined && a[k] === b[k]) (m as Record<string, unknown>)[k] = a[k];
    return m;
  };
  runs.forEach((r, i) => {
    if (r.code) return void out.push(r);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.t)!;
    if (!m[2]) return void out.push({ ...common(r, runs[i - 1] ?? runs[i + 1]), t: r.t });
    if (m[1]) out.push({ ...common(r, runs[i - 1]), t: m[1] });
    out.push({ ...r, t: m[2] });
    if (m[3]) out.push({ ...common(r, runs[i + 1]), t: m[3] });
  });
  return mergeRuns(out);
}

/** Runs as Markdown, marks opened and closed as a stack; `nl` follows each line break. */
function writeRuns(runs: Run[], o: { table: boolean; nl: string; tags: boolean }): string {
  let out = '';
  const stack: string[] = [];
  const close = (to: number) => {
    while (stack.length > to) {
      const k = stack.pop()!;
      out += k.startsWith('a:') ? `](${/[()\s<>]/.test(k.slice(2)) ? `<${k.slice(2)}>` : k.slice(2)})` : k.startsWith('span:') ? '</span>' : CLOSE[k];
    }
  };
  for (const r of runs) {
    const want = marksOf(r, o.tags);
    let k = 0;
    while (k < stack.length && k < want.length && stack[k] === want[k]) k++;
    close(k);
    for (const m of want.slice(k)) {
      out += m.startsWith('a:') ? '[' : m.startsWith('span:') ? `<span style="${m.slice(5)}">` : OPEN[m];
      stack.push(m);
    }
    const lines = r.t.split('\n');
    lines.forEach((line, j) => {
      if (j) out += o.table ? '<br>' : o.nl;
      if (!line) return;
      if (r.code) {
        const ticks = '`'.repeat(Math.max(0, ...(line.match(/`+/g) ?? []).map((x) => x.length)) + 1);
        const pad = /^`|`$|^ .* $/.test(line) ? ' ' : '';
        out += `${ticks}${pad}${line.replace(/\|/g, o.table ? '\\|' : '|')}${pad}${ticks}`;
      } else out += escText(line, !out || out.endsWith('\n') || out.endsWith(o.nl), o.table);
    });
  }
  close(0);
  return out;
}

const sameRuns = (a: Run[], b: Run[]) => a.length === b.length && a.every((r, i) => r.t === b[i].t && sameLook(r, b[i]));

/** A block's runs as Markdown that reads back as the same runs: marks as * and ~~ where they can be, as tags where not. */
function runsMd(runs: Run[], o: { table?: boolean; nl?: string } = {}): string {
  const rs = shiftSpaces(mergeRuns(runs));
  const opts = { table: !!o.table, nl: o.nl ?? '\\\n', tags: false };
  const md = writeRuns(rs, opts);
  const back = (s: string) => mdRuns(o.table ? s : s.replace(new RegExp(opts.nl.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'g'), '\n'));
  if (sameRuns(back(md), rs)) return md;
  return writeRuns(rs, { ...opts, tags: true });
}

function attrsMd(a: { cls?: string[]; kv?: Record<string, string | number> }): string {
  const parts = [...(a.cls ?? []).map((c) => `.${c}`), ...Object.entries(a.kv ?? {}).map(([k, v]) => `${k}=${v}`)];
  return parts.length ? ` {${parts.join(' ')}}` : '';
}

/**
 * The document as Markdown, as mdBlocks reads it back: headings, paragraphs, lists, quotes, code, tables, pictures,
 * rules and page breaks, with {.title} {.center} {indent=1}-style attributes, <u>, <sup>, <sub>, ==highlights== and
 * <span style> for colours, sizes and fonts. What it cannot hold: block ids, a table's alignment cell by cell (a
 * column's is kept), spaces at the start of a line, and the document's paper, margins, font and size.
 */
export function docMarkdown(d: Doc): string {
  const { counts } = listInfo(d.blocks);
  const parts: string[] = [];
  // Where each level's item's words start, for the items under it.
  const content: number[] = [];
  let prev: Block | undefined;
  d.blocks.forEach((b, i) => {
    let s = '';
    if (b.type === 'p') {
      const style = b.style ?? 'normal';
      const align = b.align ? [b.align] : [];
      if (style === 'code') {
        const text = runsText(b.runs);
        const fence = '`'.repeat(Math.max(3, ...(text.match(/`{3,}/g) ?? []).map((x) => x.length + 1)));
        s = `${fence}\n${text}\n${fence}`;
      } else if (style === 'quote') {
        const body = runsMd(b.runs, { nl: '\\\n> ' }) || '&nbsp;';
        s = `> ${body}${attrsMd({ cls: align, kv: b.lvl ? { indent: b.lvl } : {} })}`;
      } else {
        const lvl = headingLevel(style);
        const cls = [...(style === 'title' || style === 'subtitle' ? [style] : []), ...align];
        const body = runsMd(b.runs, { nl: '\\\n' });
        s = `${lvl ? `${'#'.repeat(lvl)} ` : ''}${body || (lvl ? '' : '&nbsp;')}${attrsMd({ cls, kv: b.lvl ? { indent: b.lvl } : {} })}`;
      }
      content.length = 0;
    } else if (b.type === 'li') {
      const L = b.lvl ?? 0;
      const ind = L > 0 ? (content[Math.min(L, content.length) - 1] ?? 0) + Math.max(0, L - content.length) * 2 : 0;
      const mark = b.list === 'number' ? `${counts[i] || 1}.` : '-';
      const lead = `${' '.repeat(ind)}${mark} ${b.list === 'check' ? (b.checked ? '[x] ' : '[ ] ') : ''}`;
      content.length = L;
      content[L] = ind + mark.length + 1;
      s = `${lead}${runsMd(b.runs, { nl: `\\\n${' '.repeat(ind + mark.length + 1)}` })}${attrsMd({ cls: b.align ? [b.align] : [] })}`;
    } else if (b.type === 'table') {
      content.length = 0;
      const n = b.rows[0]?.length ?? 0;
      const cell = (c: Cell) => runsMd(c.runs, { table: true }) || ' ';
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
      s = [row(header), delim, ...body.map(row)].join('\n');
    } else if (b.type === 'image') {
      content.length = 0;
      const alt = (b.alt ?? '').replace(/([\\[\]])/g, '\\$1');
      const src = /[()\s<>]/.test(b.src) ? `<${b.src}>` : b.src;
      const title = b.caption ? ` "${b.caption.replace(/(["\\])/g, '\\$1')}"` : '';
      const kv: Record<string, string> = b.w < 1 ? { width: `${Math.round(b.w * 1000) / 10}%` } : {};
      s = `![${alt}](${src}${title})${attrsMd({ cls: b.align ? [b.align] : [], kv }).trimStart()}`;
    } else if (b.type === 'hr') {
      content.length = 0;
      s = '---';
    } else {
      content.length = 0;
      s = '\\pagebreak';
    }
    if (parts.length) parts.push(prev?.type === 'li' && b.type === 'li' ? '\n' : '\n\n');
    parts.push(s);
    prev = b;
  });
  return `${parts.join('')}\n`;
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
    const w = Number(at.width) || parseFloat(st.width) || 0;
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
    out.push({ type: 'image', src, alt, w: w ? Math.min(1, w / 624) : 1, align: props?.align === 'right' ? 'right' : undefined });
  };

  const table = (el: Extract<HNode, object>, ctx: Ctx) => {
    flush();
    const rows: Raw[][] = [];
    let head = false;
    const walkRows = (n: Extract<HNode, object>, inHead: boolean) => {
      for (const k of n.kids) {
        if (typeof k === 'string') continue;
        if (k.tag === 'tr') {
          if (rows.length >= DOC_LIMITS.rows) return;
          const cells: Raw[] = [];
          for (const c of k.kids) {
            if (typeof c === 'string' || (c.tag !== 'td' && c.tag !== 'th') || hiddenEl(c.at)) continue;
            // A cell's words: its blocks as lines.
            const inner = htmlBlocks(c.kids, o).map((b) => (Array.isArray(b.runs) ? (b.runs as Run[]) : []));
            const runs: Run[] = [];
            inner.forEach((r, j) => {
              if (j && r.length) runs.push({ t: '\n' });
              runs.push(...r);
            });
            const align = alignOf(c.at.align ?? styleProps(c.at.style)['text-align']);
            cells.push({ runs: mergeRuns(runs), ...(align && align !== 'left' ? { align } : {}) });
            for (let s = Number(c.at.colspan) || 1; s > 1 && cells.length < DOC_LIMITS.cols; s--) cells.push({ runs: [] });
            if (!rows.length && (c.tag === 'th' || inHead)) head = true;
          }
          if (cells.length) rows.push(cells);
        } else if (k.tag === 'thead') walkRows(k, true);
        else if (k.tag === 'tbody' || k.tag === 'tfoot') walkRows(k, false);
        else if (k.tag !== 'table' && k.tag !== 'caption') walkRows(k, inHead);
      }
    };
    walkRows(el, false);
    void ctx;
    if (rows.length) out.push({ type: 'table', rows, ...(head ? { head: true } : {}) });
  };

  const walk = (n: HNode, ctx: Ctx) => {
    if (out.length >= DOC_LIMITS.blocks) return;
    if (typeof n === 'string') return addText(n, ctx.look, ctx);
    const tag = n.tag;
    if (RAW.has(tag) || SKIP.has(tag) || hiddenEl(n.at)) {
      // A ticked box in a list item says whether it is done.
      return;
    }
    const st = styleProps(n.at.style);
    if (/ignore/i.test(st['mso-list'] ?? '')) return;
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

  const rootCtx: Ctx = { look: {}, pre: !!o.pre, props: () => ({ type: 'p' }), inItem: false, cell: false };
  for (const n of nodes) walk(n, rootCtx);
  flush();
  // Empty lines at the start and the end, and more than one in a row, are left out.
  const blank = (b: Raw) => b.type === 'p' && !b.style && Array.isArray(b.runs) && !(b.runs as Run[]).some((r) => r.t.trim());
  const kept = out.filter((b, i) => !(blank(b) && (i === 0 || blank(out[i - 1]))));
  while (kept.length && blank(kept[kept.length - 1])) kept.pop();
  return kept;
}

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
    if (RAW.has(n.tag) || n.tag === 'img') return;
    const m = tagLook(n.tag, n.at, true) ?? (() => {
      const x: Look = {};
      styleLook(styleProps(n.at.style), x, true);
      return x;
    })();
    // A block inside a paragraph (the browser's doing) is a line of it.
    if (BLOCK.has(n.tag) && runs.length && !runs[runs.length - 1].t.endsWith('\n')) runs.push({ t: '\n' });
    for (const k of n.kids) walk(k, { ...look, ...m });
  };
  for (const n of parseHtml(html)) walk(n, {});
  return cleanRuns(runs.map((r) => ({ ...r }) as unknown as Obj));
}

// ---- drawing a document as HTML -----------------------------------------------------------------------------

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A run as HTML: its words escaped (line breaks as <br>), wrapped in the elements its look asks for. */
function runHtml(r: Run, o: { view: boolean }): string {
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
  if (r.link) h = `<a href="${escHtml(r.link)}"${o.view ? ' target="_blank" rel="noopener noreferrer"' : ''}>${h}</a>`;
  return h;
}

/** Runs as HTML; an empty paragraph (or a line break at its end) keeps its line with a <br> (marked, in the editor). */
export function runsHtml(runs: Run[], o: { view?: boolean } = {}): string {
  const view = !!o.view;
  const ph = view ? '<br>' : '<br data-ph="">';
  if (!runs.length) return ph;
  const h = runs.map((r) => runHtml(r, { view })).join('');
  return runs[runs.length - 1].t.endsWith('\n') ? h + ph : h;
}

export interface DrawOpts {
  /** Where a picture's source shows from. */
  src: (s: string) => string;
  /** The editor's: blocks marked to be read back, the ones that hold no words not editable. */
  edit?: boolean;
  /** A page break's label (in the editor). */
  breakLabel?: string;
}

const TAG: Record<ParaStyle, string> = { normal: 'p', title: 'p', subtitle: 'p', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', quote: 'blockquote', code: 'pre' };

/** A block as HTML: `label` is a list item's mark (listInfo). Every word escaped; looks only from checked values. */
export function blockHtml(b: Block, label: string, o: DrawOpts): string {
  const view = !o.edit;
  const id = o.edit ? ` data-b="${escHtml(b.id)}"` : '';
  const atom = o.edit ? ' contenteditable="false"' : '';
  if (b.type === 'p') {
    const style = b.style ?? 'normal';
    const st = [b.align ? `text-align:${b.align}` : '', b.lvl ? `--lvl:${b.lvl}` : ''].filter(Boolean).join(';');
    return `<${TAG[style]} class="nd-b nd-${style}${b.lvl ? ' nd-in' : ''}"${id}${o.edit ? ' data-t=""' : ''}${st ? ` style="${st}"` : ''}>${runsHtml(b.runs, { view })}</${TAG[style]}>`;
  }
  if (b.type === 'li') {
    const st = [b.align ? `text-align:${b.align}` : '', `--lvl:${b.lvl ?? 0}`].join(';');
    return `<p class="nd-b nd-li nd-${b.list}${b.checked ? ' nd-on' : ''}"${id}${o.edit ? ' data-t=""' : ''} data-n="${escHtml(label)}" style="${st.replace(/^;/, '')}">${runsHtml(b.runs, { view })}</p>`;
  }
  if (b.type === 'table') {
    const n = b.rows[0]?.length ?? 0;
    const cols = b.cols ?? new Array(n).fill(1 / Math.max(1, n));
    const row = (r: Cell[], ri: number, th: boolean) =>
      `<tr>${r
        .map((c, ci) => {
          const tag = th ? 'th' : 'td';
          return `<${tag}${o.edit ? ` data-c="${ri},${ci}" data-t=""` : ''}${c.align ? ` style="text-align:${c.align}"` : ''}>${runsHtml(c.runs, { view })}</${tag}>`;
        })
        .join('')}</tr>`;
    const head = b.head && b.rows.length ? `<thead>${row(b.rows[0], 0, true)}</thead>` : '';
    const body = b.rows.map((r, ri) => (b.head && ri === 0 ? '' : row(r, ri, false))).join('');
    return `<table class="nd-b nd-table"${id}><colgroup>${cols.map((w) => `<col style="width:${Math.round(w * 10000) / 100}%">`).join('')}</colgroup>${head}<tbody>${body}</tbody></table>`;
  }
  if (b.type === 'image') {
    const cap = b.caption ? `<figcaption>${escHtml(b.caption)}</figcaption>` : '';
    const img = `<img src="${escHtml(o.src(b.src))}" alt="${escHtml(b.alt ?? '')}" style="width:${Math.round(b.w * 1000) / 10}%"${o.edit ? ' draggable="false"' : ''}>`;
    return `<figure class="nd-b nd-img nd-${b.align ?? 'center'}"${id}${atom}>${img}${cap}</figure>`;
  }
  if (b.type === 'hr') return `<div class="nd-b nd-hr"${id}${atom}><hr></div>`;
  return `<div class="nd-b nd-pb"${id}${atom}${o.breakLabel ? ` data-label="${escHtml(o.breakLabel)}"` : ''}></div>`;
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
  const styleRules = (Object.keys(STYLES) as ParaStyle[])
    .filter((k) => k !== 'normal')
    .map((k) => {
      const v = STYLES[k];
      return rule(`.nd-${k}`, `font-size:${v.k}em;line-height:${v.lh};margin:${v.before}em 0 ${v.after}em;color:${v.color};font-weight:${v.bold ? 700 : 400}${v.italic ? ';font-style:italic' : ''}`);
    });
  return [
    `${scope}{font-family:${fontCss(d.font)};font-size:${d.size}pt;line-height:${STYLES.normal.lh};color:${INK};--nd-step:36pt;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-kerning:normal}`,
    rule('.nd-b', `margin:0 0 ${STYLES.normal.after}em;white-space:pre-wrap;overflow-wrap:break-word;tab-size:4`),
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
  ].join('\n');
}
