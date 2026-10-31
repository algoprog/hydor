// Pieces every document reader shares: runs of text built up span by span, a budget on how much text
// a document may give, column names, and the document as Markdown-ish text for an agent.
import type { Block, DocModel, SheetCells, Span } from '../../shared/documents.ts';

/** How much text a document may give before it is cut (the reader then says so). */
export class Budget {
  chars = 0;
  cut = false;
  constructor(public max: number) {}
  take(n: number): boolean {
    this.chars += n;
    if (this.chars > this.max) this.cut = true;
    return !this.cut;
  }
}

export interface Fmt {
  b?: boolean;
  i?: boolean;
  href?: string;
}

/** A paragraph's text, run by run: neighbours with the same look merge into one span. */
export class Spans {
  out: Span[] = [];
  constructor(private budget?: Budget) {}
  add(t: string, f: Fmt = {}) {
    if (!t) return;
    this.budget?.take(t.length);
    const last = this.out[this.out.length - 1];
    if (last && !!last.b === !!f.b && !!last.i === !!f.i && last.href === f.href) last.t += t;
    else this.out.push({ t, ...(f.b ? { b: 1 } : {}), ...(f.i ? { i: 1 } : {}), ...(f.href ? { href: f.href } : {}) });
  }
  /** The spans, trimmed at both ends; none when there is no text. */
  done(collapse = false): Span[] {
    let s = this.out;
    if (collapse) for (const x of s) x.t = x.t.replace(/[ \t\r\n]+/g, ' ');
    while (s.length && !s[0].t.trim()) s = s.slice(1);
    while (s.length && !s[s.length - 1].t.trim()) s = s.slice(0, -1);
    if (!s.length) return [];
    s[0] = { ...s[0], t: s[0].t.replace(/^\s+/, '') };
    s[s.length - 1] = { ...s[s.length - 1], t: s[s.length - 1].t.replace(/\s+$/, '') };
    return s;
  }
}

export const plain = (s: Span[]) => s.map((x) => x.t).join('');

/** 0 → A, 26 → AA. */
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** "AB12" → 27. */
export function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** A block's text without markup, for a table cell. */
export function blockPlain(b: Block): string {
  switch (b.k) {
    case 'h':
    case 'p':
      return plain(b.s);
    case 'li':
      return `${b.n ?? '•'} ${plain(b.s)}`;
    case 'table':
      return b.rows.map((r) => r.join(' | ')).join('\n');
    case 'img':
      return b.alt ? `[Image: ${b.alt}]` : '[Image]';
    case 'pre':
      return b.text;
  }
}

// ---- as text --------------------------------------------------------------------------------------

/** A span as Markdown: bold and italic markers inside its spaces, links as [text](address). */
function md(s: Span): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.t)!;
  let core = m[2];
  if (!core) return s.t;
  if (s.href) core = `[${core}](${s.href})`;
  if (s.i) core = `*${core}*`;
  if (s.b) core = `**${core}**`;
  return m[1] + core + m[3];
}

const spansMd = (s: Span[]) => s.map(md).join('');
const cell = (t: string) => t.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();

function tableMd(rows: string[][], head?: string[]): string {
  const width = Math.max(head?.length ?? 0, ...rows.map((r) => r.length));
  if (!width) return '';
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i] ?? '')).join(' | ')} |`;
  const [first, ...rest] = head ? [head, ...rows] : rows;
  return [line(first), `|${' --- |'.repeat(width)}`, ...rest.map(line)].join('\n');
}

export function blockMd(b: Block): string {
  switch (b.k) {
    case 'h':
      return `${'#'.repeat(Math.min(Math.max(b.level, 1), 6))} ${spansMd(b.s)}`;
    case 'p':
      return spansMd(b.s);
    case 'li':
      return `${'  '.repeat(Math.min(b.level, 8))}${b.n ?? '-'} ${spansMd(b.s).replace(/\n/g, `\n${'  '.repeat(Math.min(b.level, 8) + 1)}`)}`;
    case 'table':
      return tableMd(b.rows);
    case 'img':
      return b.alt ? `[Image: ${b.alt}]` : '[Image]';
    case 'pre':
      return '```\n' + b.text.replace(/\n+$/, '') + '\n```';
  }
}

export function blocksMd(blocks: Block[]): string {
  let out = '';
  blocks.forEach((b, i) => {
    const t = blockMd(b);
    if (!t) return;
    const prev = blocks[i - 1];
    // A list goes on line by line; a new list (or another kind of block) starts after a blank line.
    if (out) out += b.k === 'li' && prev?.k === 'li' && (b.level > 0 || !b.n === !prev.n) ? '\n' : '\n\n';
    out += t;
  });
  return out;
}

export function sheetMd(c: SheetCells): string {
  const width = Math.max(0, ...c.rows.map((r) => r.c.length));
  if (!width) return '(empty)';
  const head = ['', ...Array.from({ length: width }, (_, i) => colName(c.col + i))];
  return tableMd(
    c.rows.map((r) => [String(r.n), ...r.c]),
    head,
  );
}

/** The document as Markdown-ish text: headings, paragraphs, lists, tables as rows, sheets, slides and pages. */
export function docText(doc: DocModel): string {
  const out: string[] = [];
  // The title, unless the document opens with it.
  const first = doc.parts[0]?.blocks[0];
  if (doc.title && doc.parts.length > 1 && !(first?.k === 'h' && plain(first.s).trim() === doc.title.trim())) out.push(`# ${doc.title}`);
  doc.parts.forEach((p, i) => {
    const hidden = p.hidden ? ' (hidden)' : '';
    if (p.kind === 'sheet') {
      const shown = p.cells?.rows.length ?? 0;
      const size = p.cells?.more ? ` (first ${shown} rows${p.cells.totalRows > shown ? ` of about ${p.cells.totalRows}` : ''})` : '';
      out.push(`## Sheet: ${p.title ?? i + 1}${hidden}${size}`);
      if (p.cells) out.push(sheetMd(p.cells));
      if (p.blocks.length) out.push(blocksMd(p.blocks));
      if (p.cells?.formulas?.length) out.push(`Formulas: ${p.cells.formulas.map(([r, f]) => `${r} ${f}`).join('; ')}`);
    } else if (p.kind === 'slide') {
      out.push(`## Slide ${i + 1}${p.title ? `: ${p.title.replace(/\s*\n\s*/g, ' / ')}` : ''}${hidden}`);
      if (p.blocks.length) out.push(blocksMd(p.blocks));
      if (p.notes?.length) out.push(`Notes: ${blocksMd(p.notes)}`);
    } else if (p.kind === 'page') {
      // A PDF page's text as laid out, without code fences.
      out.push(`## Page ${i + 1}`);
      out.push(p.blocks.map((b) => (b.k === 'pre' ? b.text : blockMd(b))).join('\n\n') || '(no text)');
    } else {
      if (p.title && p.kind === 'extra') out.push(`## ${p.title}`);
      if (p.blocks.length) out.push(blocksMd(p.blocks));
    }
  });
  return out.filter(Boolean).join('\n\n');
}
