// Documents as other files, beside Word, Markdown, a PDF and a web page (kinds.ts registers them): plain text, to paste
// or keep anywhere; an EPUB e-book, a chapter at each Heading 1, its footnotes as e-books show theirs, its pictures and
// maths inside it; and an OpenDocument text file as LibreOffice keeps one (its paper, styles, lists, tables, pictures,
// footnotes and table of contents as LibreOffice's own). Each is made from the document with its suggested changes made,
// as its Markdown is; its comments stay in the app. And a PDF opened as a document: its words read with the app's own
// PDF reader (server/documents/pdf/), put together into a title, headings, paragraphs and list items, its pages'
// headers, footers and numbers left out, two columns read one after the other.
import crypto from 'node:crypto';
import { docRefs, type Refs } from '../../shared/doc-refs.ts';
import {
  ASSET,
  asAccepted,
  blockHtml,
  CALLOUT,
  captionWords,
  columnMm,
  COLUMN_GAP,
  cssLine,
  docHeadings,
  fontCss,
  headingLevel,
  INK,
  listInfo,
  MONO,
  MONO_FONT,
  normalizeDoc,
  paperOf,
  runsHtml,
  runsText,
  styleOf,
  tocEntries,
  type Align,
  type Band,
  type Block,
  type Doc,
  type ImageBlock,
  type ItemBlock,
  type ListKind,
  type Look,
  type MathBlock,
  type ParaBlock,
  type ParaStyle,
  type Run,
  type Spacing,
  type StyleOf,
  type TableBlock,
} from '../../shared/docs.ts';
import type { DB } from '../db.ts';
import { PdfFile } from '../documents/pdf/file.ts';
import { pages as pdfPages } from '../documents/pdf/pages.ts';
import { pageLines, type Line } from '../documents/pdf/text.ts';
import { getAsset, pictureType } from './assets.ts';
import { texToMathml } from './math.ts';
import { esc, imageSize, XML_HEAD, zipParts } from './ooxml.ts';
import type { Picture } from './pptx.ts';

// ---- what the files share --------------------------------------------------------------------------------------------

/**
 * The blocks something in the document leads to: its title, headings, bookmarks and numbered captions, and the blocks a
 * cross-reference or a link to a place in it names (those that are there).
 */
function targetsOf(d: Doc): Set<string> {
  const out = new Set<string>();
  const take = (runs: Run[]) => {
    for (const r of runs) {
      if (r.xref) out.add(r.t);
      if (r.link?.startsWith('#')) out.add(r.link.slice(1));
    }
  };
  for (const b of d.blocks) {
    if (b.type === 'p') {
      take(b.runs);
      if (b.style === 'title' || headingLevel(b.style) || b.bm) out.add(b.id);
    } else if (b.type === 'li') {
      take(b.runs);
      if (b.bm) out.add(b.id);
    } else if (b.type === 'table') {
      for (const row of b.rows) for (const c of row) take(c.runs);
      if (b.label) out.add(b.id);
    } else if ((b.type === 'image' || b.type === 'math') && b.label) out.add(b.id);
  }
  for (const n of d.notes ?? []) take(n.runs);
  const ids = new Set(d.blocks.map((b) => b.id));
  return new Set([...out].filter((id) => ids.has(id)));
}

/** Whether a block shows anything (an empty paragraph does not). */
const shows = (b: Block) => (b.type === 'p' || b.type === 'li' ? b.runs.some((r) => r.t.trim()) : b.type !== 'pagebreak');

/** The commonest words of the languages written in Latin letters most often, to tell them apart. */
const STOPWORDS: [string, string[]][] = [
  ['en', ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'it', 'for', 'with', 'this', 'are']],
  ['fr', ['le', 'la', 'les', 'et', 'des', 'est', 'une', 'dans', 'que', 'pour', 'pas', 'du']],
  ['de', ['der', 'die', 'und', 'das', 'ist', 'nicht', 'ein', 'eine', 'mit', 'den', 'sich', 'auf']],
  ['es', ['el', 'los', 'las', 'y', 'que', 'una', 'por', 'para', 'con', 'del', 'es', 'se']],
  ['it', ['il', 'di', 'che', 'e', 'la', 'per', 'una', 'sono', 'non', 'della', 'gli', 'è']],
  ['pt', ['o', 'os', 'que', 'e', 'uma', 'para', 'com', 'não', 'do', 'da', 'em', 'são']],
  ['nl', ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'niet', 'met', 'voor', 'zijn', 'op']],
];

/**
 * The language a document is written in, as a BCP 47 tag ("en", "el", "zh"): by the letters most of its words are in,
 * and in Latin letters by its commonest words; English when it cannot tell.
 */
export function docLang(d: Doc): string {
  let text = '';
  for (const b of d.blocks) {
    if (text.length > 20_000) break;
    if (b.type === 'p' || b.type === 'li') text += ` ${runsText(b.runs.filter((r) => !r.math && !r.fn && !r.cite && !r.xref))}`;
  }
  const n = (re: RegExp) => (text.match(re) ?? []).length;
  const kana = n(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const scripts: [string, number][] = [
    ['latin', n(/\p{Script=Latin}/gu)],
    ['el', n(/\p{Script=Greek}/gu)],
    ['ru', n(/\p{Script=Cyrillic}/gu)],
    ['cjk', n(/\p{Script=Han}/gu) + kana],
    ['ko', n(/\p{Script=Hangul}/gu)],
    ['ar', n(/\p{Script=Arabic}/gu)],
    ['he', n(/\p{Script=Hebrew}/gu)],
    ['th', n(/\p{Script=Thai}/gu)],
    ['hi', n(/\p{Script=Devanagari}/gu)],
  ];
  const [top, count] = scripts.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (!count) return 'en';
  if (top === 'cjk') return kana > count * 0.1 ? 'ja' : 'zh';
  if (top === 'ru') return /[єіїґ]/i.test(text) ? 'uk' : 'ru';
  if (top !== 'latin') return top;
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  let best = 'en';
  let most = 0;
  for (const [lang, list] of STOPWORDS) {
    const set = new Set(list);
    let hits = 0;
    for (const w of words) if (set.has(w)) hits++;
    if (hits > most) {
      most = hits;
      best = lang;
    }
  }
  return most >= 3 ? best : 'en';
}

/** A picture to put in a file: its bytes, its kind and its size in pixels. */
interface Pic {
  data: Buffer;
  mime: string;
  ext: string;
  w: number;
  h: number;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MIME_OF: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** A picture's bytes as the document keeps them: one of the app's (naget-asset:), or inside it (data:); none for one on the web. */
function keptBytes(db: DB, src: string): { data: Buffer; mime: string } | null {
  if (src.startsWith(ASSET)) return getAsset(db, src.slice(ASSET.length));
  const m = /^data:[^,;]*;base64,(.*)$/is.exec(src);
  if (!m) return null;
  const data = Buffer.from(m[1], 'base64');
  const mime = pictureType(data);
  return mime ? { data, mime } : null;
}

/** An SVG's size, from its width and height or its viewBox (300 × 150, as browsers take one that says neither). */
function svgSize(data: Buffer): { w: number; h: number } {
  const head = /<svg\b[^>]*>/i.exec(data.subarray(0, 8192).toString('utf8'))?.[0] ?? '';
  const num = (k: string) => {
    const m = new RegExp(`\\s${k}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, 'i').exec(head);
    return m ? parseFloat(m[1]) : NaN;
  };
  let w = num('width');
  let h = num('height');
  const vb = /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(head);
  if ((!(w > 0) || !(h > 0)) && vb) {
    const vw = parseFloat(vb[1]);
    const vh = parseFloat(vb[2]);
    if (w > 0 && vw > 0) h = (w * vh) / vw;
    else if (h > 0 && vh > 0) w = (h * vw) / vh;
    else [w, h] = [vw, vh];
  }
  return w > 0 && h > 0 ? { w, h } : { w: 300, h: 150 };
}

function picOf(data: Buffer, mime: string | undefined): Pic | null {
  const ext = mime ? EXT[mime] : undefined;
  if (!mime || !ext) return null;
  if (mime === 'image/svg+xml') return { data, mime, ext, ...svgSize(data) };
  const s = imageSize(data);
  return s && s.w > 0 && s.h > 0 ? { data, mime, ext, w: s.w, h: s.h } : null;
}

/** A picture made ready for a file by the export (one from the web, fetched; an SVG or WebP drawn as PNG), as a Pic. */
const readyPic = (p: Picture | null | undefined): Pic | null => (p ? picOf(p.data, MIME_OF[p.ext]) : null);

// ---- plain text -------------------------------------------------------------------------------------------------------

/** Words as plain text: footnotes' marks as [1], citations and cross-references as their words, maths as its LaTeX. */
const plain = (runs: Run[], refs: Refs) => runs.map((r) => (r.fn ? `[${refs.note(r.t) || '*'}]` : r.cite || r.xref ? refs.text(r) : r.t)).join('');

/**
 * The document as plain text (UTF-8), its lines as they are, never wrapped: a blank line between paragraphs, headings
 * and the title as their words; list items with their marks (• 1. ☐ ☑), a level deeper indented under the words of the
 * one above; a table as its caption and then a line a row, its cells between tabs; a picture as its caption (or what
 * it shows); an equation as its LaTeX; footnotes' marks as [1], their words after the document; citations,
 * cross-references and the bibliography as they read; a page break as a form feed.
 */
export function textOfDoc(doc: Doc): string {
  const d = asAccepted(doc);
  const refs = docRefs(d);
  const { labels } = listInfo(d.blocks);
  const chunks: string[] = [];
  let list: string[] | null = null;
  // Where each level's item's words start, for the items under it.
  const content: number[] = [];
  let kind: string | undefined;
  const endList = () => {
    if (list) chunks.push(list.join('\n'));
    list = null;
    content.length = 0;
  };
  d.blocks.forEach((b, i) => {
    // Another list (another kind at the top level) after a blank line, as anything else.
    if (b.type !== 'li' || (!b.lvl && b.list !== kind)) endList();
    kind = b.type === 'li' && !b.lvl ? b.list : kind;
    if (b.type === 'p') {
      let words = plain(b.runs, refs);
      if (!words.trim()) return;
      if (b.style === 'callout') words = `${b.icon ?? CALLOUT.icon} ${words}`;
      const pad = b.lvl ? ' '.repeat(4 * b.lvl) : '';
      chunks.push(pad ? words.replace(/^/gm, pad) : words);
    } else if (b.type === 'li') {
      const L = b.lvl ?? 0;
      const ind = L > 0 ? (content[Math.min(L, content.length) - 1] ?? 0) + Math.max(0, L - content.length) * 2 : 0;
      const mark = b.list === 'check' ? (b.checked ? '☑' : '☐') : labels[i] || '•';
      content.length = L;
      content[L] = ind + [...mark].length + 1;
      const lines = plain(b.runs, refs).split('\n');
      (list ??= []).push(`${' '.repeat(ind)}${mark} ${lines.join(`\n${' '.repeat(content[L])}`)}`);
    } else if (b.type === 'table') {
      const covered = coveredCells(b);
      const rows = b.rows.map((r, ri) => r.map((c, ci) => (covered.has(`${ri},${ci}`) ? '' : plain(c.runs, refs).replace(/\s*\n\s*/g, ' '))).join('\t'));
      const cap = captionWords(b, refs);
      chunks.push([...(cap ? [cap] : []), ...rows].join('\n'));
    } else if (b.type === 'image') {
      const cap = captionWords(b, refs);
      chunks.push(cap || (b.alt ? `[Picture: ${b.alt}]` : '[Picture]'));
    } else if (b.type === 'math') {
      const n = b.label ? /\d+$/.exec(refs.label(b.id) ?? '')?.[0] : undefined;
      chunks.push(`${b.tex}${n ? `    (${n})` : ''}`);
    } else if (b.type === 'bib') {
      for (const e of refs.bib()) chunks.push(plain(e, refs));
    } else if (b.type === 'toc') {
      const lines = tocEntries(d).map((e) => `${'  '.repeat(e.level - 1)}${e.text}`);
      if (lines.length) chunks.push(lines.join('\n'));
    } else if (b.type === 'hr') chunks.push('----------');
    else if (b.type === 'pagebreak') chunks.push('\f');
  });
  endList();
  // The footnotes, by their numbers, after a short line.
  const notes = (d.notes ?? [])
    .map((n) => ({ n: refs.note(n.id), runs: n.runs }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.n - b.n)
    .map((x) => {
      const head = `[${x.n}] `;
      return head + plain(x.runs, refs).split('\n').join(`\n${' '.repeat(head.length)}`);
    });
  if (notes.length) chunks.push(`__________\n${notes.join('\n')}`);
  return `${chunks.join('\n\n')}\n`;
}

/** The cells a table's merged ones cover, as "row,column". */
function coveredCells(t: TableBlock): Set<string> {
  const out = new Set<string>();
  t.rows.forEach((r, ri) =>
    r.forEach((c, ci) => {
      if (out.has(`${ri},${ci}`)) return;
      for (let y = 0; y < (c.rs ?? 1); y++) for (let x = 0; x < (c.cs ?? 1); x++) if (y || x) out.add(`${ri + y},${ci + x}`);
    }),
  );
  return out;
}

// ---- EPUB -------------------------------------------------------------------------------------------------------------

/** Words for XHTML: escaped with numeric references only, as every XML reader takes them. */
const escX = (s: string) => esc(s).replace(/&(amp|lt|gt|quot);/g, (_m, n: string) => `&#${XML_ENT[n]};`);
const XML_ENT: Record<string, number> = { amp: 38, lt: 60, gt: 62, quot: 34, apos: 39 };

/**
 * HTML as the document's own page draws it, made XHTML (what an EPUB's reader parses as XML): elements that hold
 * nothing closed in themselves, named references made numbers, and a link's new-window attributes left out.
 */
const xhtml = (html: string) =>
  html
    .replace(/<(br|hr|img|col|wbr)\b([^<>]*?)\s*\/?>/g, '<$1$2/>')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_m, n: string) => `&#${XML_ENT[n]};`)
    .replace(/ target="_blank" rel="noopener noreferrer"/g, '');

/** A stable identifier from some words: a UUID made of their hash (the same document gets the same one each time). */
function uuidOf(s: string): string {
  const h = crypto.createHash('sha1').update(s).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The e-book's stylesheet: the document's font and its paragraph styles, sized in ems so a reader's own size still works. */
function epubCss(d: Doc): string {
  const own = d.styles ?? {};
  const look = (sel: string, k: ParaStyle) => {
    const s = styleOf(d, k);
    const color = own[k]?.color;
    return `${sel}{font-size:${s.k}em;line-height:${s.lh};margin:${s.before}em 0 ${s.after}em;font-weight:${s.bold ? 'bold' : 'normal'};font-style:${s.italic ? 'italic' : 'normal'}${s.font ? `;font-family:${k === 'code' ? `${fontCss(s.font)},${MONO}` : fontCss(s.font)}` : ''}${s.align ? `;text-align:${s.align}` : ''}${color ? `;color:${color}` : ''}}`;
  };
  const N = styleOf(d, 'normal');
  const normal = own.normal;
  return [
    `body{font-family:${fontCss(d.font)};line-height:${N.lh}${normal?.color ? `;color:${normal.color}` : ''}}`,
    `p{margin:0 0 ${N.after}em${normal?.b ? ';font-weight:bold' : ''}${normal?.i ? ';font-style:italic' : ''}${normal?.align ? `;text-align:${normal.align}` : ''}}`,
    look('.title', 'title'),
    look('.subtitle', 'subtitle'),
    look('h1', 'h1'),
    look('h2', 'h2'),
    look('h3', 'h3'),
    look('h4', 'h4'),
    'h1,h2,h3,h4,.title,.subtitle{page-break-after:avoid;break-after:avoid}',
    look('blockquote', 'quote'),
    'blockquote{padding-left:.9em;border-left:3px solid #d0d7de;margin-left:0;margin-right:0}blockquote p{margin:0}',
    look('pre', 'code'),
    `pre{font-family:${MONO};white-space:pre-wrap;background:#f6f8fa;border:1px solid #e5e9ee;border-radius:6px;padding:.7em .9em}`,
    `code{font-family:${MONO};font-size:.9em}`,
    '.callout{padding:.75em 1em;border-radius:8px}.callout p{margin:0}.callout .icon{margin-right:.3em}',
    'p.li{margin:0 0 .25em;padding-left:1.6em;text-indent:-1.6em}p.li .mark{display:inline-block;width:1.6em;text-indent:0}p.li.done{color:#80868b;text-decoration:line-through}',
    'table{border-collapse:collapse;width:100%;margin:.3em 0 .9em}',
    'td,th{border:1px solid #d0d7de;padding:.35em .55em;vertical-align:top;text-align:left;font-weight:inherit}',
    'thead th{background:#f3f5f7;font-weight:bold}',
    'caption{caption-side:top;text-align:left;font-size:.88em;color:#5f6368;padding:0 0 .4em}',
    'figure{margin:.4em 0 .9em;text-align:center}figure.left{text-align:left}figure.right{text-align:right}',
    'figure img{max-width:100%;height:auto}',
    'figcaption{margin-top:.45em;font-size:.88em;line-height:1.35;color:#5f6368}',
    'hr{border:0;border-top:1px solid #c8ccd1;margin:1em 0}',
    '.pb{page-break-after:always;break-after:page}',
    '.toc p{margin:0 0 .2em}.toc .toc-1{font-weight:bold}.toc .toc-2{padding-left:1.4em}.toc .toc-3{padding-left:2.8em}.toc a{text-decoration:none}',
    '.math{text-align:center;margin:.5em 0 1em}.math .eqn{float:right}',
    '.bib-e{margin:0 0 .6em;padding-left:2.2em;text-indent:-2.2em}',
    'sup,sub{font-size:.72em;line-height:0}',
    'a.noteref{text-decoration:none}',
    '.notes{margin-top:2em;padding-top:.6em;border-top:1px solid #c8ccd1;font-size:.85em}.notes p{margin:0 0 .3em}.note-n{margin-right:.3em}',
  ].join('\n');
}

/**
 * The document as an EPUB 3 e-book: its title and language, a chapter (an XHTML file) at each Heading 1 that has
 * something before it, the table of contents from its headings, its pictures inside it (`picture`: one from the web,
 * fetched by the export), maths as MathML, each chapter's footnotes at its end as the e-book's own (shown where their
 * marks are, in the readers that do), and links between chapters kept.
 */
export function epubOfDoc(db: DB, doc: Doc, title: string, picture?: (src: string) => Picture | null): Buffer {
  const d = asAccepted(doc);
  const refs = docRefs(d);
  const { labels } = listInfo(d.blocks);
  const lang = docLang(d);
  const name = title.trim() || docHeadings(d)[0]?.text || 'Document';
  const targets = targetsOf(d);
  // Its chapters: a Heading 1 starts one, once something shows before it.
  const chapters: number[][] = [[]];
  d.blocks.forEach((b, i) => {
    const cur = chapters[chapters.length - 1];
    if (b.type === 'p' && b.style === 'h1' && cur.some((k) => shows(d.blocks[k]))) chapters.push([i]);
    else cur.push(i);
  });
  const fileName = (k: number) => `chapter-${String(k + 1).padStart(2, '0')}.xhtml`;
  const fileOf = new Map<string, string>();
  chapters.forEach((list, k) => list.forEach((i) => fileOf.set(d.blocks[i].id, fileName(k))));
  // Its pictures, each once, as files of the book.
  const pics = new Map<string, { href: string; pic: Pic }>();
  for (const b of d.blocks) {
    if (b.type !== 'image' || pics.has(b.src)) continue;
    const kept = keptBytes(db, b.src);
    const pic = (kept && picOf(kept.data, kept.mime)) ?? readyPic(picture?.(b.src));
    if (pic) pics.set(b.src, { href: `images/picture-${pics.size + 1}.${pic.ext}`, pic });
  }
  const notes = new Map((d.notes ?? []).map((n) => [n.id, n]));
  const ro = { view: true, math: texToMathml, refs };
  const words = (runs: Run[]) => runsHtml(runs, ro);
  const idOf = (b: Block) => (targets.has(b.id) ? ` id="nd-${b.id}"` : '');
  const ownStyle = (b: Spacing & { align?: Align; lvl?: number }, more: string[] = []) => {
    const st = [b.align ? `text-align:${b.align}` : '', b.lvl ? `margin-left:${b.lvl * 2}em` : '', b.lh !== undefined ? `line-height:${cssLine(b.lh)}` : '', b.sb !== undefined ? `margin-top:${b.sb}pt` : '', b.sa !== undefined ? `margin-bottom:${b.sa}pt` : '', ...more].filter(Boolean).join(';');
    return st ? ` style="${st}"` : '';
  };

  const para = (b: ParaBlock) => {
    const style = b.style ?? 'normal';
    const lvl = headingLevel(style);
    const at = `${idOf(b)} class="${style}"`;
    if (style === 'code') return `<pre${at}${ownStyle(b)}>${escX(runsText(b.runs))}</pre>`;
    if (style === 'quote') return `<blockquote${at}${ownStyle(b)}><p>${words(b.runs)}</p></blockquote>`;
    if (style === 'callout') return `<div${at}${ownStyle(b, [`background-color:${b.tint ?? CALLOUT.tint}`])}><p><span class="icon">${escX(b.icon ?? CALLOUT.icon)}</span>${words(b.runs)}</p></div>`;
    const tag = style === 'title' ? 'h1' : lvl ? `h${lvl}` : 'p';
    return `<${tag}${at}${ownStyle(b)}>${words(b.runs)}</${tag}>`;
  };
  const item = (b: ItemBlock, i: number) => {
    const mark = b.list === 'check' ? (b.checked ? '☑' : '☐') : labels[i] || '•';
    return `<p${idOf(b)} class="li${b.list === 'check' && b.checked ? ' done' : ''}"${ownStyle(b)}><span class="mark">${escX(mark)}</span>${words(b.runs)}</p>`;
  };
  const image = (b: ImageBlock) => {
    const p = pics.get(b.src);
    const cap = captionWords(b, refs);
    if (!p) return cap || b.alt ? `<p${idOf(b)}><em>${escX(cap || b.alt || '')}</em></p>` : targets.has(b.id) ? `<div id="nd-${b.id}"></div>` : '';
    return `<figure${idOf(b)} class="${b.align ?? 'center'}"><img src="${p.href}" alt="${escX(b.alt ?? '')}" style="width:${Math.round(b.w * 1000) / 10}%"/>${cap ? `<figcaption>${escX(cap)}</figcaption>` : ''}</figure>`;
  };
  const math = (b: MathBlock) => {
    const n = b.label ? /\d+$/.exec(refs.label(b.id) ?? '')?.[0] : undefined;
    return `<div${idOf(b)} class="math">${n ? `<span class="eqn">(${n})</span>` : ''}${texToMathml(b.tex, true)}</div>`;
  };
  const block = (b: Block, i: number): string => {
    if (b.type === 'p') return para(b);
    if (b.type === 'li') return item(b, i);
    if (b.type === 'image') return image(b);
    if (b.type === 'math') return math(b);
    if (b.type === 'table') {
      // Drawn as the document's own page draws it: its caption, widths, header row and merged cells.
      const h = blockHtml(b, '', { src: (s) => s, math: texToMathml, refs });
      return targets.has(b.id) && !h.includes(` id="nd-${b.id}"`) ? h.replace(/^<table/, `<table id="nd-${b.id}"`) : h;
    }
    if (b.type === 'bib') return `<div${idOf(b)} class="bib" epub:type="bibliography">${refs.bib().map((e) => `<p class="bib-e">${runsHtml(e, { view: true })}</p>`).join('')}</div>`;
    if (b.type === 'toc') return `<div${idOf(b)} class="toc">${tocEntries(d).map((e) => `<p class="toc-${e.level}"><a href="#nd-${e.id}">${escX(e.text)}</a></p>`).join('')}</div>`;
    if (b.type === 'hr') return `<hr${idOf(b)}/>`;
    return '<div class="pb"></div>';
  };
  /** A chapter's footnotes, at its end: each the e-book's own, with a link back to its mark. */
  const notesOf = (list: number[]) => {
    const ids = new Set<string>();
    const take = (runs: Run[]) => {
      for (const r of runs) if (r.fn && notes.has(r.t) && refs.note(r.t)) ids.add(r.t);
    };
    for (const i of list) {
      const b = d.blocks[i];
      if (b.type === 'p' || b.type === 'li') take(b.runs);
      else if (b.type === 'table') for (const row of b.rows) for (const c of row) take(c.runs);
    }
    if (!ids.size) return '';
    const asides = [...ids].map((id) => `<aside id="nd-fn-${id}" class="note" epub:type="footnote"><p><a class="note-n" href="#nd-fn-${id}-ref">${refs.note(id)}</a>${words(notes.get(id)!.runs)}</p></aside>`);
    return `<section class="notes" epub:type="footnotes">${asides.join('')}</section>`;
  };
  /** A chapter's XHTML made right for its file: footnotes' marks the e-book's, ids once each, links to another chapter by its file. */
  const finish = (html: string, here: string) => {
    let h = xhtml(html).replace(/<a href="#nd-fn-/g, '<a class="noteref" epub:type="noteref" href="#nd-fn-');
    const seen = new Set<string>();
    h = h.replace(/ id="([^"]*)"/g, (m, id: string) => (seen.has(id) ? '' : (seen.add(id), m)));
    return h.replace(/ href="#nd-([^"]*)"/g, (m, id: string) => {
      const note = id.startsWith('fn-') ? id.slice(3) : '';
      if (note && (notes.has(note) || (note.endsWith('-ref') && notes.has(note.slice(0, -4))))) return m;
      const f = targets.has(id) ? fileOf.get(id) : undefined;
      // Nowhere to go: the words stay, without their link.
      if (!f) return '';
      return f === here ? m : ` href="${f}#nd-${id}"`;
    });
  };
  const page = (head: string, body: string) =>
    `${XML_HEAD}<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">\n<head>\n<meta charset="utf-8"/>\n<title>${escX(head)}</title>\n<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  const files = chapters.map((list, k) => {
    const here = fileName(k);
    const body = finish(list.map((i) => block(d.blocks[i], i)).join('\n') + notesOf(list), here);
    const first = list.map((i) => d.blocks[i]).find((b): b is ParaBlock => b.type === 'p' && (b.style === 'title' || !!headingLevel(b.style)) && !!runsText(b.runs).trim());
    return { name: here, xhtml: page(first ? runsText(first.runs).replace(/\s+/g, ' ').trim().slice(0, 200) : name, body), math: body.includes('<math') };
  });

  // The table of contents: its headings, a level never more than one below the one before.
  const entries = tocEntries(d).filter((e) => fileOf.has(e.id));
  const toc: string[] = ['<ol>'];
  if (!entries.length) toc.push(`<li><a href="${fileName(0)}">${escX(name)}</a></li>`);
  let depth = 1;
  entries.forEach((e, k) => {
    const lvl = k ? Math.max(1, Math.min(e.level, depth + 1)) : 1;
    if (k && lvl > depth) {
      toc.push('<ol>');
      depth++;
    } else if (k) {
      toc.push('</li>');
      for (; depth > lvl; depth--) toc.push('</ol></li>');
    }
    toc.push(`<li><a href="${fileOf.get(e.id)}#nd-${e.id}">${escX(e.text)}</a>`);
  });
  if (entries.length) {
    toc.push('</li>');
    for (; depth > 1; depth--) toc.push('</ol></li>');
  }
  toc.push('</ol>');
  const nav = page(name, `<nav epub:type="toc" id="toc"><h1>${escX(name)}</h1>${toc.join('')}</nav>`);

  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const items = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...files.map((f, k) => `<item id="c${k + 1}" href="${f.name}" media-type="application/xhtml+xml"${f.math ? ' properties="mathml"' : ''}/>`),
    ...[...pics.values()].map((p, k) => `<item id="p${k + 1}" href="${p.href}" media-type="${p.pic.mime}"/>`),
  ];
  const opf =
    `${XML_HEAD}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:${uuidOf(`${name}\n${d.blocks[0]?.id ?? ''}`)}</dc:identifier><dc:title>${escX(name)}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata>` +
    `<manifest>${items.join('')}</manifest><spine>${files.map((_, k) => `<itemref idref="c${k + 1}"/>`).join('')}</spine></package>`;
  const container = `${XML_HEAD}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  return zipParts([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: epubCss(d) },
    ...files.map((f) => ({ name: `OEBPS/${f.name}`, data: f.xhtml })),
    ...[...pics.values()].map((p) => ({ name: `OEBPS/${p.href}`, data: p.pic.data })),
  ]);
}

// ---- OpenDocument ---------------------------------------------------------------------------------------------------

const ODF_NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
].join(' ');

const pt = (n: number) => `${Math.round(n * 100) / 100}pt`;
const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;
const PT_MM = 25.4 / 72;

/** Words as OpenDocument keeps them: spaces it would fold into one written as spaces, line breaks and tabs as its own. */
function odtText(t: string, st: { sp: boolean }): string {
  let out = '';
  for (const part of t.split(/( +|\n|\t)/)) {
    if (!part) continue;
    if (part === '\n') {
      out += '<text:line-break/>';
      st.sp = true;
    } else if (part === '\t') {
      out += '<text:tab/>';
      st.sp = false;
    } else if (part[0] === ' ') {
      const n = part.length;
      out += st.sp ? `<text:s${n > 1 ? ` text:c="${n}"` : ''}/>` : n > 1 ? ` <text:s${n > 2 ? ` text:c="${n - 1}"` : ''}/>` : ' ';
      st.sp = true;
    } else {
      out += esc(part);
      st.sp = false;
    }
  }
  return out;
}

/** A paragraph's alignment as OpenDocument says it. */
const alignAttr = (a: Align | undefined) => (a ? `fo:text-align="${a}"` : '');

/** The faces a font name stands for: serif, sans or monospace, as LibreOffice picks one it has in its place. */
function fontFace(name: string): string {
  const css = fontCss(name).toLowerCase();
  const generic = /monospace/.test(css) ? 'modern' : /\bserif\b/.test(css.replace(/sans-serif/g, '')) ? 'roman' : 'swiss';
  return `<style:font-face style:name="${esc(name)}" svg:font-family="${esc(/\s/.test(name) ? `'${name}'` : name)}" style:font-family-generic="${generic}" style:font-pitch="${generic === 'modern' ? 'fixed' : 'variable'}"/>`;
}

/**
 * The document as an OpenDocument text file (.odt, ODF 1.2), as LibreOffice opens and keeps it: its paper, margins,
 * landscape, columns and colour; its font and size, and its paragraph styles as named styles (Title, Subtitle, Heading 1
 * to 4 with their outline levels, Quotations, Preformatted Text, captions, footnotes); words' looks as automatic styles;
 * links; lists of bullets, numbers and checklists (☐ ☑); tables with their columns' widths, header row, fills and merged
 * cells; pictures inside it (`picture`: made ready by the export, as for Word); footnotes; page breaks; captions under
 * pictures and over tables; the table of contents as LibreOffice's own (Update fills in its page numbers); the
 * bibliography's entries; equations as their LaTeX; the header and footer with page numbers.
 */
export function odtOfDoc(db: DB, doc: Doc, title: string, picture?: (src: string) => Picture | null): Buffer {
  const d = asAccepted(doc);
  const refs = docRefs(d);
  const lang = docLang(d);
  const targets = targetsOf(d);
  const size = d.size;
  const faces = new Set<string>([d.font, MONO_FONT]);
  const fontAttrs = (f: string) => {
    faces.add(f);
    const n = esc(f);
    return `style:font-name="${n}" style:font-name-asian="${n}" style:font-name-complex="${n}"`;
  };
  const sizeAttrs = (p: number) => `fo:font-size="${pt(p)}" style:font-size-asian="${pt(p)}" style:font-size-complex="${pt(p)}"`;
  const BOLD = 'fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"';
  const ITALIC = 'fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"';
  const weight = (b: boolean | undefined) => (b ? BOLD : 'fo:font-weight="normal" style:font-weight-asian="normal" style:font-weight-complex="normal"');
  const slant = (i: boolean | undefined) => (i ? ITALIC : 'fo:font-style="normal" style:font-style-asian="normal" style:font-style-complex="normal"');

  // Automatic styles (content.xml's), each made once for the look it gives.
  const auto: string[] = [];
  const made = new Map<string, string>();
  const styled = (family: string, prefix: string, body: string, parent = '', more = '') => {
    const key = `${family}|${parent}|${more}|${body}`;
    let n = made.get(key);
    if (!n) {
      n = `${prefix}${made.size + 1}`;
      made.set(key, n);
      auto.push(`<style:style style:name="${n}" style:family="${family}"${parent ? ` style:parent-style-name="${parent}"` : ''}${more}>${body}</style:style>`);
    }
    return n;
  };

  /** A run's look as text properties; `base` is its paragraph's size (code is a little smaller). */
  const textProps = (r: Look, base: number) => {
    const a: string[] = [];
    if (r.b) a.push(BOLD);
    if (r.i) a.push(ITALIC);
    if (r.u) a.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (r.s) a.push('style:text-line-through-style="solid" style:text-line-through-type="single"');
    if (r.sup) a.push('style:text-position="super 58%"');
    else if (r.sub) a.push('style:text-position="sub 58%"');
    if (r.color) a.push(`fo:color="${r.color}"`);
    if (r.hl) a.push(`fo:background-color="${r.hl}"`);
    else if (r.code) a.push('fo:background-color="#f1f3f5"');
    if (r.size) a.push(sizeAttrs(r.size));
    else if (r.code) a.push(sizeAttrs(Math.round(base * 0.9 * 2) / 2));
    if (r.code || r.math) a.push(fontAttrs(MONO_FONT));
    else if (r.font) a.push(fontAttrs(r.font));
    return a.join(' ');
  };
  const span = (r: Look, base: number, inner: string) => {
    const p = textProps(r, base);
    return p && inner ? `<text:span text:style-name="${styled('text', 'T', `<style:text-properties ${p}/>`)}">${inner}</text:span>` : inner;
  };
  const sup = (inner: string) => `<text:span text:style-name="${styled('text', 'T', '<style:text-properties style:text-position="super 58%"/>')}">${inner}</text:span>`;

  // Where links and cross-references lead: a bookmark at each block something leads to.
  const mark = (id: string) => (targets.has(id) ? `<text:bookmark text:name="nd-${id}"/>` : '');
  const link = (href: string, inner: string) => {
    let h = href;
    if (h.startsWith('#')) {
      if (!targets.has(h.slice(1))) return inner;
      h = `#nd-${h.slice(1)}`;
    }
    return `<text:a xlink:type="simple" xlink:href="${esc(h)}" text:style-name="Internet_20_link" text:visited-style-name="Visited_20_Internet_20_Link">${inner}</text:a>`;
  };

  // Footnotes: the first mark of each holds its words, the marks after it refer to it.
  const notes = new Map((d.notes ?? []).map((n) => [n.id, n]));
  const written = new Map<string, string>();
  const runXml = (r: Run, base: number, st: { sp: boolean }, inNote: boolean): string => {
    if (r.fn) {
      const n = refs.note(r.t);
      const note = notes.get(r.t);
      if (!n || !note) return '';
      st.sp = false;
      if (inNote) return sup(String(n));
      const was = written.get(r.t);
      if (was) return sup(`<text:note-ref text:note-class="footnote" text:reference-format="text" text:ref-name="${was}">${n}</text:note-ref>`);
      const id = `ftn${written.size + 1}`;
      written.set(r.t, id);
      return `<text:note text:id="${id}" text:note-class="footnote"><text:note-citation>${n}</text:note-citation><text:note-body><text:p text:style-name="Footnote">${runsXml(note.runs, size * 0.82, true)}</text:p></text:note-body></text:note>`;
    }
    if (r.cite || r.xref) {
      const inner = span(r, base, odtText(refs.text(r), st));
      return r.xref ? link(`#${r.t}`, inner) : inner;
    }
    return span(r, base, odtText(r.t, st));
  };
  /** Runs as a paragraph's content: those that share a link in one. */
  function runsXml(runs: Run[], base: number, inNote = false): string {
    const st = { sp: true };
    let out = '';
    for (let i = 0; i < runs.length; ) {
      let j = i;
      while (j < runs.length && runs[j].link === runs[i].link) j++;
      const inner = runs
        .slice(i, j)
        .map((r) => runXml(r, base, st, inNote))
        .join('');
      out += runs[i].link ? link(runs[i].link!, inner) : inner;
      i = j;
    }
    return out;
  }

  // A page break is the next paragraph's (or table's) break before; the title page, the first one's page style.
  const titled = !!(d.titlePage && (d.header || d.footer));
  let breakNext = false;
  let first = true;
  const startAttrs = () => {
    const more = first && titled ? ' style:master-page-name="First_20_Page"' : '';
    first = false;
    const brk = breakNext ? 'fo:break-before="page"' : '';
    breakNext = false;
    return { more, brk };
  };
  /** A paragraph's style: `parent`, or an automatic one on it with its own spacing, alignment and the like. */
  const pStyle = (parent: string, own: string[] = [], text = '') => {
    const { more, brk } = startAttrs();
    const props = [...own, brk].filter(Boolean);
    if (!props.length && !text && !more) return parent;
    return styled('paragraph', 'P', `${props.length ? `<style:paragraph-properties ${props.join(' ')}/>` : ''}${text ? `<style:text-properties ${text}/>` : ''}`, parent, more);
  };
  const spacing = (b: Spacing & { align?: Align; lvl?: number }, indent = true) =>
    [
      alignAttr(b.align),
      indent && b.lvl ? `fo:margin-left="${pt(b.lvl * 36)}"` : '',
      b.lh !== undefined ? `fo:line-height="${Math.round(b.lh * 100)}%"` : '',
      b.sb !== undefined ? `fo:margin-top="${pt(b.sb)}"` : '',
      b.sa !== undefined ? `fo:margin-bottom="${pt(b.sa)}"` : '',
    ].filter(Boolean);

  const STYLE_NAME: Record<ParaStyle, string> = {
    normal: 'Standard',
    title: 'Title',
    subtitle: 'Subtitle',
    h1: 'Heading_20_1',
    h2: 'Heading_20_2',
    h3: 'Heading_20_3',
    h4: 'Heading_20_4',
    quote: 'Quotations',
    code: 'Preformatted_20_Text',
    callout: 'Callout',
  };
  const ptOf = (k: ParaStyle) => size * styleOf(d, k).k;

  const paraXml = (b: ParaBlock) => {
    const style = b.style ?? 'normal';
    const lvl = headingLevel(style);
    const own = spacing(b, !lvl && style !== 'title' && style !== 'subtitle');
    if (style === 'callout' && b.tint) own.push(`fo:background-color="${b.tint}"`);
    const name = pStyle(STYLE_NAME[style], own);
    if (style === 'code') return `<text:p text:style-name="${name}">${mark(b.id)}${odtText(runsText(b.runs), { sp: true })}</text:p>`;
    const icon = style === 'callout' ? `${esc(b.icon ?? CALLOUT.icon)} ` : '';
    const inner = `${mark(b.id)}${icon}${runsXml(b.runs, ptOf(style))}`;
    return lvl ? `<text:h text:style-name="${name}" text:outline-level="${lvl}">${inner}</text:h>` : `<text:p text:style-name="${name}">${inner}</text:p>`;
  };
  const itemXml = (b: ItemBlock) => {
    const done = b.list === 'check' && b.checked;
    const name = pStyle(done ? 'List_20_Checked' : 'List_20_Paragraph', spacing(b, false));
    const box = b.list === 'check' ? `${b.checked ? '☑' : '☐'} ` : '';
    return `<text:p text:style-name="${name}">${mark(b.id)}${box}${runsXml(b.runs, size)}</text:p>`;
  };

  // Pictures, each once, as files of the package.
  const pics = new Map<string, { href: string; pic: Pic } | null>();
  const picFor = (src: string) => {
    if (!pics.has(src)) {
      const kept = keptBytes(db, src);
      const pic = readyPic(picture?.(src)) ?? (kept ? picOf(kept.data, kept.mime) : null);
      pics.set(src, pic ? { href: `Pictures/${[...pics.values()].filter(Boolean).length + 1}.${pic.ext}`, pic } : null);
    }
    return pics.get(src)!;
  };
  const textW = columnMm(d.page);
  const paper = paperOf(d.page);
  const textH = paper.h - 2 * d.page.margin;
  let frames = 0;
  const imageXml = (b: ImageBlock) => {
    const p = picFor(b.src);
    const cap = captionWords(b, refs);
    const align = alignAttr(b.align ?? 'center');
    if (!p) return cap || b.alt ? `<text:p text:style-name="${pStyle('Standard', [align])}">${mark(b.id)}${span({ i: true }, size, odtText(cap || b.alt || '', { sp: true }))}</text:p>` : '';
    let w = Math.max(5, textW * b.w);
    let h = (w * p.pic.h) / Math.max(1, p.pic.w);
    if (h > textH * 0.9) [w, h] = [(w * textH * 0.9) / h, textH * 0.9];
    frames++;
    const fr = styled('graphic', 'fr', '<style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" fo:padding="0mm" fo:border="none"/>');
    const frame = `<draw:frame draw:style-name="${fr}" draw:name="Picture ${frames}" text:anchor-type="as-char" svg:width="${mm(w)}" svg:height="${mm(h)}" draw:z-index="0"><draw:image xlink:href="${p.href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${b.alt ? `<svg:desc>${esc(b.alt)}</svg:desc>` : ''}</draw:frame>`;
    const pic = `<text:p text:style-name="${pStyle('Standard', [align, 'fo:line-height="100%"', `fo:margin-top="${pt(size * 0.4)}"`, `fo:margin-bottom="${pt(cap ? size * 0.2 : size * 0.9)}"`, ...(cap ? ['fo:keep-with-next="always"'] : [])])}">${mark(b.id)}${frame}</text:p>`;
    return cap ? `${pic}<text:p text:style-name="${pStyle('Figure', [align])}">${odtText(cap, { sp: true })}</text:p>` : pic;
  };

  let tables = 0;
  const tableXml = (b: TableBlock) => {
    tables++;
    const n = Math.max(1, b.rows[0]?.length ?? 1);
    const widths = b.cols?.length === n ? b.cols : new Array<number>(n).fill(1 / n);
    const cap = captionWords(b, refs);
    const capXml = cap ? `<text:p text:style-name="${pStyle('Table', ['fo:keep-with-next="always"'])}">${mark(b.id)}${odtText(cap, { sp: true })}</text:p>` : '';
    const { more, brk } = startAttrs();
    const tStyle = styled('table', 'Tb', `<style:table-properties style:width="${mm(textW)}" table:align="margins" fo:margin-top="${pt(size * 0.3)}" fo:margin-bottom="${pt(size * 0.9)}"${brk ? ` ${brk}` : ''}/>`, '', more);
    const cols = widths.map((w) => `<table:table-column table:style-name="${styled('table-column', 'Tc', `<style:table-column-properties style:column-width="${mm(textW * w)}" style:rel-column-width="${Math.max(1, Math.round(w * 65535))}*"/>`)}"/>`).join('');
    const covered = coveredCells(b);
    const pad = `fo:padding-top="${pt(size * 0.35)}" fo:padding-bottom="${pt(size * 0.35)}" fo:padding-left="${pt(size * 0.55)}" fo:padding-right="${pt(size * 0.55)}"`;
    let marked = !!cap;
    const row = (r: TableBlock['rows'][number], ri: number, head: boolean) =>
      `<table:table-row>${r
        .map((c, ci) => {
          if (covered.has(`${ri},${ci}`)) return '<table:covered-table-cell/>';
          const fill = c.fill ?? (head ? '#f3f5f7' : '');
          const cs = styled('table-cell', 'Td', `<style:table-cell-properties ${pad} fo:border="0.5pt solid #d0d7de" style:vertical-align="${c.va ?? 'top'}"${fill ? ` fo:background-color="${fill}"` : ''}/>`);
          const cs2 = Math.min(c.cs ?? 1, n - ci);
          const rs = Math.min(c.rs ?? 1, b.rows.length - ri);
          const span2 = `${cs2 > 1 ? ` table:number-columns-spanned="${cs2}"` : ''}${rs > 1 ? ` table:number-rows-spanned="${rs}"` : ''}`;
          const ps = c.align ? styled('paragraph', 'P', `<style:paragraph-properties ${alignAttr(c.align)}/>`, head ? 'Table_20_Heading' : 'Table_20_Contents') : head ? 'Table_20_Heading' : 'Table_20_Contents';
          const bm = marked ? '' : ((marked = true), mark(b.id));
          return `<table:table-cell table:style-name="${cs}"${span2}><text:p text:style-name="${ps}">${bm}${runsXml(c.runs, size)}</text:p></table:table-cell>`;
        })
        .join('')}</table:table-row>`;
    const head = b.head && b.rows.length ? `<table:table-header-rows>${row(b.rows[0], 0, true)}</table:table-header-rows>` : '';
    const body = b.rows.map((r, ri) => (b.head && ri === 0 ? '' : row(r, ri, false))).join('');
    return `${capXml}<table:table table:name="Table${tables}" table:style-name="${tStyle}">${cols}${head}${body}</table:table>`;
  };

  let tocs = 0;
  const tocXml = () => {
    tocs++;
    // A page break before it (or the title page's style) goes on a paragraph of its own: an index takes neither.
    const lead = breakNext || (first && titled) ? `<text:p text:style-name="${pStyle('Standard')}"/>` : '';
    const tpl = [1, 2, 3]
      .map((l) => `<text:table-of-content-entry-template text:outline-level="${l}" text:style-name="Contents_20_${l}"><text:index-entry-link-start/><text:index-entry-text/><text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/><text:index-entry-link-end/></text:table-of-content-entry-template>`)
      .join('');
    const lines = tocEntries(d).map((e) => `<text:p text:style-name="Contents_20_${e.level}"><text:a xlink:type="simple" xlink:href="#nd-${e.id}">${esc(e.text)}</text:a></text:p>`);
    return `${lead}<text:table-of-content text:protected="true" text:name="Table of Contents${tocs}"><text:table-of-content-source text:outline-level="3">${tpl}</text:table-of-content-source><text:index-body>${lines.join('') || '<text:p text:style-name="Contents_20_1"/>'}</text:index-body></text:table-of-content>`;
  };

  const mathXml = (b: MathBlock) => {
    const n = b.label ? /\d+$/.exec(refs.label(b.id) ?? '')?.[0] : undefined;
    return `<text:p text:style-name="${pStyle('Equation')}">${mark(b.id)}${span({ math: true }, size, odtText(b.tex, { sp: true }))}${n ? ` (${n})` : ''}</text:p>`;
  };
  const bibXml = (b: Block) => {
    const entries = refs.bib();
    if (!entries.length) return `<text:p text:style-name="${pStyle('Bibliography_20_1')}">${mark(b.id)}</text:p>`;
    return entries.map((e, k) => `<text:p text:style-name="${pStyle('Bibliography_20_1')}">${k ? '' : mark(b.id)}${runsXml(e, size)}</text:p>`).join('');
  };

  // The body: blocks in order, list items in lists (one inside another a level deeper; a level skipped, an item with
  // no paragraph of its own; another kind at a level, a list of its own, as the editor numbers them).
  const body: string[] = [];
  const open: ListKind[] = [];
  const closeLists = (to = 0) => {
    for (; open.length > to; open.pop()) body.push('</text:list-item></text:list>');
  };
  const openList = (kind: ListKind) => {
    body.push(`<text:list text:style-name="L_${kind}"><text:list-item>`);
    open.push(kind);
  };
  for (const b of d.blocks) {
    if (b.type !== 'li') closeLists();
    if (b.type === 'p') body.push(paraXml(b));
    else if (b.type === 'li') {
      const L = b.lvl ?? 0;
      closeLists(L + 1);
      if (open.length === L + 1 && open[L] === b.list) body.push('</text:list-item><text:list-item>');
      else {
        closeLists(L);
        while (open.length < L) openList(b.list);
        openList(b.list);
      }
      body.push(itemXml(b));
    } else if (b.type === 'table') body.push(tableXml(b));
    else if (b.type === 'image') body.push(imageXml(b));
    else if (b.type === 'math') body.push(mathXml(b));
    else if (b.type === 'bib') body.push(bibXml(b));
    else if (b.type === 'toc') body.push(tocXml());
    else if (b.type === 'hr') body.push(`<text:p text:style-name="${pStyle('Horizontal_20_Line')}">${mark(b.id)}</text:p>`);
    else if (b.type === 'pagebreak') breakNext = true;
  }
  closeLists();
  if (!body.length) body.push('<text:p text:style-name="Standard"/>');

  // Named styles: the document's own paragraph styles, and those its parts are written in.
  const named = (k: ParaStyle, name: string, display: string, parent: string, extra = '', more = '') => {
    const s: StyleOf = styleOf(d, k);
    const p = size * s.k;
    return `<style:style style:name="${name}" style:display-name="${display}" style:family="paragraph" style:parent-style-name="${parent}"${more} style:class="text"><style:paragraph-properties fo:margin-top="${pt(s.before * p)}" fo:margin-bottom="${pt(s.after * p)}" fo:line-height="${Math.round((s.lh / 1.15) * 100)}%"${s.align ? ` ${alignAttr(s.align)}` : ''}${extra}/><style:text-properties ${sizeAttrs(p)} fo:color="${s.color}" ${weight(s.bold)} ${slant(s.italic)}${s.font ? ` ${fontAttrs(s.font)}` : ''}/></style:style>`;
  };
  const N = styleOf(d, 'normal');
  const normal = d.styles?.normal;
  const plainStyle = (name: string, display: string, parent: string, para: string, text = '', cls = 'text') =>
    `<style:style style:name="${name}" style:display-name="${display}" style:family="paragraph" style:parent-style-name="${parent}" style:class="${cls}">${para ? `<style:paragraph-properties ${para}/>` : ''}${text ? `<style:text-properties ${text}/>` : ''}</style:style>`;
  const capPt = Math.round(size * 0.88 * 2) / 2;
  const bandPt = Math.round(size * 0.82 * 2) / 2;
  const listLevel = (kind: ListKind, k: number) => {
    const at = `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${pt(k * 36 + 1.6 * size)}" fo:text-indent="${pt(-1.6 * size)}" fo:margin-left="${pt(k * 36 + 1.6 * size)}"/></style:list-level-properties>`;
    if (kind === 'bullet') return `<text:list-level-style-bullet text:level="${k + 1}" text:bullet-char="${['•', '◦', '▪'][k % 3]}">${at}</text:list-level-style-bullet>`;
    if (kind === 'number') return `<text:list-level-style-number text:level="${k + 1}" style:num-suffix="." style:num-format="${['1', 'a', 'i'][k % 3]}">${at}</text:list-level-style-number>`;
    return `<text:list-level-style-number text:level="${k + 1}" style:num-format="">${at}</text:list-level-style-number>`;
  };
  const listStyle = (kind: ListKind, display: string) => `<text:list-style style:name="L_${kind}" style:display-name="${display}">${Array.from({ length: 10 }, (_, k) => listLevel(kind, k)).join('')}</text:list-style>`;
  const linkText = 'fo:color="#1a5fd8" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"';
  const officeStyles = [
    `<style:default-style style:family="paragraph"><style:paragraph-properties style:tab-stop-distance="${pt(36)}" style:writing-mode="page"/><style:text-properties ${fontAttrs(d.font)} ${sizeAttrs(size)} ${langAttrs(lang)}/></style:default-style>`,
    `<style:style style:name="Standard" style:family="paragraph" style:class="text"><style:paragraph-properties fo:margin-top="${pt(N.before * size)}" fo:margin-bottom="${pt(N.after * size)}" fo:line-height="${Math.round((N.lh / 1.15) * 100)}%"${normal?.align ? ` ${alignAttr(normal.align)}` : ''}/><style:text-properties ${fontAttrs(d.font)} ${sizeAttrs(size)} fo:color="${normal?.color ?? INK}" ${weight(normal?.b)} ${slant(normal?.i)}/></style:style>`,
    plainStyle('Text_20_body', 'Text body', 'Standard', ''),
    `<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="text"><style:paragraph-properties fo:keep-with-next="always"/></style:style>`,
    named('title', 'Title', 'Title', 'Heading', '', ' style:next-style-name="Subtitle"'),
    named('subtitle', 'Subtitle', 'Subtitle', 'Heading', '', ' style:next-style-name="Standard"'),
    ...([1, 2, 3, 4] as const).map((l) => named(`h${l}`, `Heading_20_${l}`, `Heading ${l}`, 'Heading', '', ` style:next-style-name="Standard" style:default-outline-level="${l}"`)),
    named('quote', 'Quotations', 'Quotations', 'Standard', ` fo:margin-left="${pt(size * 0.9 + 3)}" fo:padding-left="${pt(size * 0.9)}" fo:border-left="2.25pt solid #d0d7de" fo:border-right="none" fo:border-top="none" fo:border-bottom="none"`),
    named('code', 'Preformatted_20_Text', 'Preformatted Text', 'Standard', ` fo:background-color="#f6f8fa" fo:padding="${pt(size * 0.7)}" fo:border="0.5pt solid #e5e9ee"`).replace(/<style:text-properties /, `<style:text-properties ${styleOf(d, 'code').font ? '' : `${fontAttrs(MONO_FONT)} `}`),
    named('callout', 'Callout', 'Callout', 'Standard', ` fo:background-color="${CALLOUT.tint}" fo:padding="${pt(size * 0.75)}"`),
    plainStyle('List_20_Paragraph', 'List Paragraph', 'Standard', `fo:margin-top="0pt" fo:margin-bottom="${pt(size * 0.25)}"`),
    plainStyle('List_20_Checked', 'List Checked', 'List_20_Paragraph', '', 'fo:color="#80868b" style:text-line-through-style="solid" style:text-line-through-type="single"'),
    plainStyle('Table_20_Contents', 'Table Contents', 'Standard', 'fo:margin-top="0pt" fo:margin-bottom="0pt" fo:line-height="117%"', '', 'extra'),
    plainStyle('Table_20_Heading', 'Table Heading', 'Table_20_Contents', '', BOLD, 'extra'),
    plainStyle('Caption', 'Caption', 'Standard', `fo:margin-top="${pt(size * 0.45)}" fo:margin-bottom="${pt(size * 0.9)}" fo:line-height="117%"`, `${sizeAttrs(capPt)} fo:color="#5f6368"`, 'extra'),
    plainStyle('Figure', 'Figure', 'Caption', 'fo:text-align="center"', '', 'extra'),
    plainStyle('Table', 'Table', 'Caption', `fo:margin-top="${pt(size * 0.3)}" fo:margin-bottom="${pt(size * 0.4)}"`, '', 'extra'),
    plainStyle('Equation', 'Equation', 'Standard', `fo:text-align="center" fo:margin-top="${pt(size * 0.5)}" fo:margin-bottom="${pt(size)}"`),
    plainStyle('Footnote', 'Footnote', 'Standard', `fo:margin-top="0pt" fo:margin-bottom="${pt(size * 0.25)}" fo:line-height="122%"`, `${sizeAttrs(Math.round(size * 0.82 * 2) / 2)} fo:color="#3c4043"`, 'extra'),
    plainStyle('Header', 'Header', 'Standard', 'fo:margin-top="0pt" fo:margin-bottom="0pt" fo:line-height="100%"', `${sizeAttrs(bandPt)} fo:color="#5f6368"`, 'extra'),
    plainStyle('Footer', 'Footer', 'Standard', 'fo:margin-top="0pt" fo:margin-bottom="0pt" fo:line-height="100%"', `${sizeAttrs(bandPt)} fo:color="#5f6368"`, 'extra'),
    plainStyle('Contents_20_Heading', 'Contents Heading', 'Heading', '', `${sizeAttrs(Math.round(size * 1.45 * 2) / 2)} ${BOLD}`, 'index'),
    ...[1, 2, 3].map((l) => plainStyle(`Contents_20_${l}`, `Contents ${l}`, 'Standard', `fo:margin-left="${pt((l - 1) * size * 1.4)}" fo:margin-top="0pt" fo:margin-bottom="${pt(size * 0.2)}"`, l === 1 ? BOLD : '', 'index')),
    plainStyle('Bibliography_20_1', 'Bibliography 1', 'Standard', `fo:margin-left="${pt(size * 2.2)}" fo:text-indent="${pt(-size * 2.2)}" fo:margin-top="0pt" fo:margin-bottom="${pt(size * 0.6)}"`, '', 'index'),
    plainStyle('Horizontal_20_Line', 'Horizontal Line', 'Standard', `fo:margin-top="${pt(size * 0.5)}" fo:margin-bottom="${pt(size * 0.6)}" fo:line-height="100%" fo:border-bottom="0.75pt solid #c8ccd1" fo:padding="0pt"`, sizeAttrs(4), 'html'),
    `<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties ${linkText}/></style:style>`,
    `<style:style style:name="Visited_20_Internet_20_Link" style:display-name="Visited Internet Link" style:family="text"><style:text-properties ${linkText}/></style:style>`,
    '<style:style style:name="Footnote_20_Symbol" style:display-name="Footnote Symbol" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>',
    '<style:style style:name="Footnote_20_anchor" style:display-name="Footnote anchor" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>',
    '<style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="as-char" style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>',
    `<text:outline-style style:name="Outline">${Array.from({ length: 10 }, (_, k) => `<text:outline-level-style text:level="${k + 1}" style:num-format=""/>`).join('')}</text:outline-style>`,
    listStyle('bullet', 'Bullets'),
    listStyle('number', 'Numbering 123'),
    listStyle('check', 'Checklist'),
    '<text:notes-configuration text:note-class="footnote" text:citation-style-name="Footnote_20_Symbol" text:citation-body-style-name="Footnote_20_anchor" text:default-style-name="Footnote" style:num-format="1" text:start-value="0" text:footnotes-position="page" text:start-numbering-at="document"/>',
  ];

  // The page: its paper, margins, columns and colour; the header and footer in its top and bottom margins.
  const m = d.page.margin;
  const band = (b: Band | undefined) => {
    if (!b) return { h: 0, gap: 0 };
    const h = bandPt * 1.25 * PT_MM;
    return { h, gap: Math.min(5, m / 4) };
  };
  const hd = band(d.header);
  const ft = band(d.footer);
  const top = Math.max(4, m - hd.h - hd.gap);
  const bottom = Math.max(4, m - ft.h - ft.gap);
  const cols = d.page.cols && d.page.cols > 1 ? `<style:columns fo:column-count="${d.page.cols}" fo:column-gap="${mm(COLUMN_GAP)}"/>` : '';
  const layout = (name: string, bands: boolean) =>
    `<style:page-layout style:name="${name}"><style:page-layout-properties fo:page-width="${mm(paper.w)}" fo:page-height="${mm(paper.h)}" style:num-format="1" style:print-orientation="${d.page.orient === 'landscape' ? 'landscape' : 'portrait'}" fo:margin-top="${mm(bands && d.header ? top : m)}" fo:margin-bottom="${mm(bands && d.footer ? bottom : m)}" fo:margin-left="${mm(m)}" fo:margin-right="${mm(m)}"${d.page.color ? ` fo:background-color="${d.page.color}"` : ''} style:writing-mode="lr-tb">${cols}<style:footnote-sep style:width="0.5pt" style:distance-before-sep="1mm" style:distance-after-sep="1mm" style:line-style="solid" style:adjustment="left" style:rel-width="33%" style:color="#c8ccd1"/></style:page-layout-properties>` +
    `<style:header-style>${bands && d.header ? `<style:header-footer-properties fo:min-height="${mm(hd.h)}" fo:margin-bottom="${mm(hd.gap)}"/>` : ''}</style:header-style>` +
    `<style:footer-style>${bands && d.footer ? `<style:header-footer-properties fo:min-height="${mm(ft.h)}" fo:margin-top="${mm(ft.gap)}"/>` : ''}</style:footer-style></style:page-layout>`;
  const bandAuto: string[] = [];
  const bandXml = (b: Band, base: 'Header' | 'Footer') => {
    let style: string = base;
    if (b.align) {
      style = `${base === 'Header' ? 'MH' : 'MF'}1`;
      bandAuto.push(`<style:style style:name="${style}" style:family="paragraph" style:parent-style-name="${base}"><style:paragraph-properties fo:text-align="${b.align === 'center' ? 'center' : 'end'}"/></style:style>`);
    }
    const st = { sp: true };
    const words = b.text
      .split(/(\{pages?\})/i)
      .map((p) => {
        if (/^\{page\}$/i.test(p)) return (st.sp = false), '<text:page-number text:select-page="current">1</text:page-number>';
        if (/^\{pages\}$/i.test(p)) return (st.sp = false), '<text:page-count>1</text:page-count>';
        return odtText(p, st);
      })
      .join('');
    return `<text:p text:style-name="${style}">${words}</text:p>`;
  };
  const header = d.header ? `<style:header>${bandXml(d.header, 'Header')}</style:header>` : '';
  const footer = d.footer ? `<style:footer>${bandXml(d.footer, 'Footer')}</style:footer>` : '';
  const masters = `<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">${header}${footer}</style:master-page>${titled ? '<style:master-page style:name="First_20_Page" style:display-name="First Page" style:page-layout-name="pm2" style:next-style-name="Standard"/>' : ''}</office:master-styles>`;

  const decls = () => `<office:font-face-decls>${[...faces].map(fontFace).join('')}</office:font-face-decls>`;
  const content = `${XML_HEAD}<office:document-content ${ODF_NS} office:version="1.2">${decls()}<office:automatic-styles>${auto.join('')}</office:automatic-styles><office:body><office:text>${body.join('')}</office:text></office:body></office:document-content>`;
  const styles = `${XML_HEAD}<office:document-styles ${ODF_NS} office:version="1.2">${decls()}<office:styles>${officeStyles.join('')}</office:styles><office:automatic-styles>${layout('pm1', true)}${titled ? layout('pm2', false) : ''}${bandAuto.join('')}</office:automatic-styles>${masters}</office:document-styles>`;
  const when = new Date().toISOString().replace(/\.\d+Z$/, '');
  const meta = `${XML_HEAD}<office:document-meta ${ODF_NS} office:version="1.2"><office:meta><meta:generator>Hydor</meta:generator><dc:title>${esc(title)}</dc:title><dc:language>${lang}</dc:language><meta:creation-date>${when}</meta:creation-date><dc:date>${when}</dc:date></office:meta></office:document-meta>`;
  const files = [...pics.values()].filter((p): p is { href: string; pic: Pic } => !!p);
  const manifest = `${XML_HEAD}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>${['content.xml', 'styles.xml', 'meta.xml'].map((f) => `<manifest:file-entry manifest:full-path="${f}" manifest:media-type="text/xml"/>`).join('')}${files.map((p) => `<manifest:file-entry manifest:full-path="${p.href}" manifest:media-type="${p.pic.mime}"/>`).join('')}</manifest:manifest>`;
  return zipParts([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text', store: true },
    { name: 'content.xml', data: content },
    { name: 'styles.xml', data: styles },
    { name: 'meta.xml', data: meta },
    ...files.map((p) => ({ name: p.href, data: p.pic.data })),
    { name: 'META-INF/manifest.xml', data: manifest },
  ]);
}

/** A language as OpenDocument's text properties say it (Chinese, Japanese and Korean as Asian text). */
function langAttrs(lang: string): string {
  const country: Record<string, string> = { en: 'US', el: 'GR', zh: 'CN', ja: 'JP', ko: 'KR', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT', nl: 'NL', ru: 'RU', uk: 'UA', ar: 'SA', he: 'IL', th: 'TH', hi: 'IN' };
  const c = country[lang] ?? 'US';
  if (lang === 'zh' || lang === 'ja' || lang === 'ko') return `fo:language="en" fo:country="US" style:language-asian="${lang}" style:country-asian="${c}"`;
  return `fo:language="${lang}" fo:country="${c}"`;
}

// ---- a PDF opened as a document ---------------------------------------------------------------------------------

/** A line of a PDF's page, as a document is made from it: points from the page's top-left. */
export interface PdfLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its baseline, and the size most of its letters are. */
  base: number;
  size: number;
  /** Where each of its characters starts and ends across the page, when known: to cut it in two where columns meet. */
  xs?: [number, number][];
}

export interface PdfPageText {
  w: number;
  h: number;
  lines: PdfLine[];
}

/** A line as the PDF reader gives it (text.ts), for a document: only words that read left to right (a margin's stamp turned on its side is left out). */
function pdfLine(l: Line): PdfLine | null {
  const gs = l.glyphs;
  if (!gs.length || gs[0].dir !== 0 || !l.text.trim()) return null;
  const sizes = new Map<number, number>();
  for (const g of gs) {
    const s = Math.round(g.size * 2) / 2;
    sizes.set(s, (sizes.get(s) ?? 0) + g.text.length);
  }
  const size = [...sizes].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const bases = gs.map((g) => g.oy).sort((a, b) => a - b);
  const chars = [...l.text];
  const xs: [number, number][] = chars.map((_, ci) => {
    const k = l.map[ci] ?? -1;
    return k >= 0 && gs[k] ? [gs[k].x0, gs[k].x1] : [NaN, NaN];
  });
  // A space put between words spans the gap between them.
  xs.forEach((x, ci) => {
    if (!Number.isNaN(x[0])) return;
    const before = xs[ci - 1]?.[1] ?? l.x;
    const after = xs.slice(ci + 1).find((y) => !Number.isNaN(y[0]))?.[0] ?? before;
    xs[ci] = [before, Math.max(before, after)];
  });
  return { text: l.text, x: l.x, y: l.y, w: l.w, h: l.h, base: bases[bases.length >> 1], size, xs };
}

/**
 * A PDF opened as a document: its title, headings (by their size, four levels at most), paragraphs and list items, in
 * the order they read (two columns one after the other), without its pages' numbers, headers and footers. Pictures are
 * left out. Throws, in words a person can act on, for a PDF with no text in it (a scan) or one that cannot be read.
 */
export function docFromPdf(buf: Buffer): Doc {
  const f = new PdfFile(buf);
  const pages = pdfPages(f).map((p) => ({ w: p.width, h: p.height, lines: pageLines(f, p).flatMap((l) => pdfLine(l) ?? []) }));
  if (!pages.some((p) => p.lines.some((l) => /[\p{L}\p{N}]/u.test(l.text))))
    throw new Error('This PDF has no text in it (a scanned page?), so there are no words to make a document of. Make a copy whose text can be picked (text recognition, OCR, in a scanner’s app or a PDF editor) and open that, or give the PDF to an agent in a conversation: it can read the pages from their pictures.');
  return normalizeDoc({ blocks: pdfBlocks(pages) });
}

/** A line in the order the page reads: its page (from 1), and its column (0 the whole width, 1 left, 2 right). */
interface Placed {
  line: PdfLine;
  page: number;
  col: number;
}

/** Lines as one text: a word broken at a line's end with a hyphen joined again, Chinese and Japanese without spaces. */
function joinWords(a: string, b: string): string {
  if (/­$/.test(a)) return a.slice(0, -1) + b;
  if (/\p{L}[-‐]$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(a) && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(b)) return a + b;
  return `${a} ${b}`;
}

const LIGATURES: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
const cleanLine = (t: string) =>
  t
    .replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** What a list item starts with: a bullet (as symbol fonts draw one too), a number or a letter, a box. */
const MARKER = /^(?:([•●○◦▪■□►▸‣⁃∙·*\-–—])|([☐☑☒✓✔✗✘])|(\(?(?:\d{1,3}|[a-z])[.)]|[A-Z]\)))\s+(?=\S)/u;

/** A page's number, as pages print it: "3", "Page 3", "3 of 9", "– 3 –", "iv". */
const PAGE_NO = /^(?:(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?|[-–—]\s*\d{1,4}\s*[-–—]|(?=[ivxlc]+$)(?:c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))$/i;

/**
 * The lines of a PDF's pages put together into a document's blocks (as normalizeDoc takes them): the words most of it
 * is in are its body's size; lines clearly larger are headings, four levels by their sizes, and a first one on page 1
 * larger than all others its title; lines join into paragraphs until a gap larger than its lines', another size, a first
 * line set in, or a list's mark; a bullet, number or letter at a line's start makes a list item, its level by how far
 * in its mark is; lines on most pages' top or bottom (headers, footers) and page numbers are left out.
 */
export function pdfBlocks(pages: PdfPageText[]): Record<string, unknown>[] {
  const tally = new Map<number, number>();
  for (const p of pages) for (const l of p.lines) tally.set(Math.round(l.size * 2) / 2, (tally.get(Math.round(l.size * 2) / 2) ?? 0) + l.text.length);
  const body = [...tally].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 10;
  const kept = runningLinesOut(pages.map((p) => ({ ...p, lines: withRaised(p.lines) })));
  const placed: Placed[] = [];
  kept.forEach((lines, k) => {
    for (const x of readingOrder(lines, pages[k].w, body)) placed.push({ ...x, page: k + 1 });
  });
  return blocksOf(paragraphs(placed, body), body);
}

/** Each page's lines without its page number, and (with two pages or more) the lines most pages have at their top or bottom. */
function runningLinesOut(pages: PdfPageText[]): PdfLine[][] {
  // The same words, the same size, at the same height: a title on the first page is no header with its words.
  const key = (l: PdfLine) => `${l.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()}|${Math.round(l.size)}|${Math.round(l.y / 6)}`;
  const edges = pages.map((p) => {
    const sorted = [...p.lines].sort((a, b) => a.y - b.y);
    return new Set([...sorted.slice(0, 2).filter((l) => l.y + l.h < p.h * 0.15), ...sorted.slice(-2).filter((l) => l.y > p.h * 0.85)]);
  });
  const count = new Map<string, number>();
  for (const set of edges) for (const k of new Set([...set].map(key))) count.set(k, (count.get(k) ?? 0) + 1);
  const most = Math.max(2, Math.ceil(pages.length * 0.5));
  return pages.map((p, i) =>
    p.lines.filter((l) => {
      if (!edges[i].has(l)) return true;
      if (PAGE_NO.test(l.text.trim())) return false;
      return pages.length < 2 || (count.get(key(l)) ?? 0) < most;
    }),
  );
}

/**
 * A line's stretches of words across the page: where its characters are, those less than a little more than its size
 * apart in one (the spaces between words never count, so two columns' lines read as one stay two stretches).
 */
function stretches(l: PdfLine): [number, number][] {
  if (!l.xs?.length) return [[l.x, l.x + l.w]];
  const chars = [...l.text];
  const out: [number, number][] = [];
  l.xs.forEach(([a, b], i) => {
    if (chars[i] === ' ' || Number.isNaN(a)) return;
    const last = out[out.length - 1];
    if (last && a - last[1] <= l.size * 1.2) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  });
  return out.length ? out : [[l.x, l.x + l.w]];
}

/**
 * Where a page's two columns meet, if it has two: an empty strip down its middle, between lines that reach up to it on
 * the left and start from it on the right, beside each other down the page. Lines whose words run across the middle
 * (a title, a paragraph the whole width) are not counted: they are a part of the page that is not in columns.
 */
function gutterOf(lines: PdfLine[], width: number, body: number): { x0: number; x1: number } | null {
  const W = Math.max(1, Math.ceil(width));
  const narrow = lines
    .filter((l) => Math.abs(l.size - body) <= body * 0.2)
    .map((l) => ({ l, s: stretches(l) }))
    .filter(({ s }) => !s.some(([a, b]) => a < W * 0.45 && b > W * 0.55));
  if (narrow.length < 8) return null;
  const cover = new Float64Array(W + 1);
  for (const { s } of narrow) for (const [a, b] of s) for (let x = Math.max(0, Math.floor(a)); x <= Math.min(W, Math.ceil(b)); x++) cover[x]++;
  const limit = Math.max(1, narrow.length * 0.05);
  let best: { x0: number; x1: number } | null = null;
  let start = -1;
  const lo = Math.floor(W * 0.35);
  const hi = Math.ceil(W * 0.65);
  for (let x = lo; x <= hi + 1; x++) {
    const low = x <= hi && cover[x] <= limit;
    if (low && start < 0) start = x;
    if (!low && start >= 0) {
      if (!best || x - start > best.x1 - best.x0) best = { x0: start, x1: x };
      start = -1;
    }
  }
  if (!best || best.x1 - best.x0 < Math.max(4, body * 0.5)) return null;
  const g = best;
  // The stretches left of it (where each line's ends) and right of it (where each starts), with their lines' baselines.
  const ends: number[] = [];
  const starts: number[] = [];
  const leftBase: number[] = [];
  const rightBase: number[] = [];
  for (const { l, s } of narrow) {
    const left = s.filter(([, b]) => b <= g.x0 + 1);
    const right = s.filter(([a]) => a >= g.x1 - 1);
    if (left.length) (ends.push(Math.max(...left.map((x) => x[1]))), leftBase.push(l.base));
    if (right.length) (starts.push(Math.min(...right.map((x) => x[0]))), rightBase.push(l.base));
  }
  if (ends.length < 4 || starts.length < 4) return null;
  // Columns, not a form's labels and their values: most left lines end near the strip, most right ones start at it.
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];
  if (median(ends) < g.x0 - W * 0.12 || median(starts) > g.x1 + W * 0.06) return null;
  const overlap = Math.min(Math.max(...leftBase), Math.max(...rightBase)) - Math.max(Math.min(...leftBase), Math.min(...rightBase));
  return overlap >= 3 * body ? g : null;
}

/**
 * A line cut where the columns meet: its left and right parts; one that runs a little over the strip goes with the side
 * most of it is on; null for one that runs well into both (the whole width).
 */
function cutAt(l: PdfLine, g: { x0: number; x1: number }, width: number): { left?: PdfLine; right?: PdfLine } | null {
  if (l.x + l.w <= g.x0 + 1) return { left: l };
  if (l.x >= g.x1 - 1) return { right: l };
  const across = () => {
    const inLeft = g.x0 - l.x;
    const inRight = l.x + l.w - g.x1;
    if (inLeft > width * 0.12 && inRight > width * 0.12) return null;
    return inLeft >= inRight ? { left: l } : { right: l };
  };
  if (!l.xs) return across();
  const chars = [...l.text];
  let k = -1;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === ' ') continue;
    const [a, b] = l.xs[i];
    if (b <= g.x0 + 1) continue;
    if (a >= g.x1 - 1) {
      k = i;
      break;
    }
    return across();
  }
  if (k < 0) return { left: l };
  const part = (from: number, to: number): PdfLine | undefined => {
    // Without the spaces at its ends.
    let a = from;
    let b = to;
    while (a < b && chars[a] === ' ') a++;
    while (b > a && chars[b - 1] === ' ') b--;
    if (a >= b) return undefined;
    const xs = l.xs!.slice(a, b);
    const solid = xs.filter((_, i) => chars[a + i] !== ' ');
    const x0 = Math.min(...solid.map((x) => x[0]));
    const x1 = Math.max(...solid.map((x) => x[1]));
    return { ...l, text: chars.slice(a, b).join(''), xs, x: x0, w: x1 - x0 };
  };
  return { left: part(0, k), right: part(k, chars.length) };
}

/**
 * A page's lines with the small words raised or lowered beside a line (a footnote's number, an exponent), which the
 * reader finds as lines of their own, put back into it where they are.
 */
function withRaised(lines: PdfLine[]): PdfLine[] {
  const out = [...lines];
  for (const t of lines) {
    if ([...t.text].length > 4 || !t.text.trim() || !out.includes(t)) continue;
    let host: PdfLine | undefined;
    for (const h of out) {
      if (h === t || h.size < t.size * 1.1 || t.x < h.x - 1 || t.x > h.x + h.w + h.size * 0.5) continue;
      const d = t.base - h.base;
      if (d > -0.75 * h.size && d < 0.45 * h.size && (!host || Math.abs(d) < Math.abs(t.base - host.base))) host = h;
    }
    if (!host) continue;
    const chars = [...host.text];
    const at = host.xs ? host.xs.findIndex(([a], i) => chars[i] !== ' ' && a >= t.x) : -1;
    // Right after the word before it.
    let k = at < 0 ? chars.length : at;
    while (k > 0 && chars[k - 1] === ' ') k--;
    const merged: PdfLine = {
      ...host,
      text: [...chars.slice(0, k), ...t.text, ...chars.slice(k)].join(''),
      w: Math.max(host.x + host.w, t.x + t.w) - host.x,
      ...(host.xs ? { xs: [...host.xs.slice(0, k), ...(t.xs ?? [...t.text].map((): [number, number] => [t.x, t.x + t.w])), ...host.xs.slice(k)] } : {}),
    };
    out.splice(out.indexOf(host), 1, merged);
    out.splice(out.indexOf(t), 1);
  }
  return out;
}

/** A page's lines in the order they read: top to bottom, and with two columns, the left one's down to a line across both, then the right one's. */
function readingOrder(lines: PdfLine[], width: number, body: number): { line: PdfLine; col: number }[] {
  const sorted = [...lines].sort((a, b) => a.base - b.base || a.x - b.x);
  const g = gutterOf(sorted, width, body);
  if (!g) return sorted.map((line) => ({ line, col: 0 }));
  const out: { line: PdfLine; col: number }[] = [];
  let left: PdfLine[] = [];
  let right: PdfLine[] = [];
  const flush = () => {
    for (const line of left) out.push({ line, col: 1 });
    for (const line of right) out.push({ line, col: 2 });
    left = [];
    right = [];
  };
  for (const l of sorted) {
    const parts = cutAt(l, g, width);
    if (!parts) {
      flush();
      out.push({ line: l, col: 0 });
      continue;
    }
    if (parts.left) left.push(parts.left);
    if (parts.right) right.push(parts.right);
  }
  flush();
  return out;
}

interface Para {
  text: string;
  size: number;
  page: number;
  lines: Placed[];
  /** A list item: its kind, where its mark and its words start, and a box ticked. */
  list?: { kind: ListKind; at: number; words: number; checked?: boolean };
}

/** Lines joined into paragraphs (see pdfBlocks). */
function paragraphs(placed: Placed[], body: number): Para[] {
  // The distance from one line's baseline to the next in the body's paragraphs.
  const gaps: number[] = [];
  for (let i = 1; i < placed.length; i++) {
    const a = placed[i - 1];
    const b = placed[i];
    const gap = b.line.base - a.line.base;
    if (a.page === b.page && a.col === b.col && Math.abs(a.line.size - body) < 0.6 && Math.abs(b.line.size - body) < 0.6 && gap > body * 0.5 && gap < body * 2.5) gaps.push(gap);
  }
  gaps.sort((x, y) => x - y);
  const lead = gaps.length ? gaps[gaps.length >> 1] : body * 1.2;
  // Each column's right edge, where its full lines end.
  const rights = new Map<string, number>();
  {
    const by = new Map<string, number[]>();
    for (const p of placed) {
      if (Math.abs(p.line.size - body) >= 0.6) continue;
      const k = `${p.page}|${p.col}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(p.line.x + p.line.w);
    }
    for (const [k, v] of by) rights.set(k, v.sort((x, y) => x - y)[Math.floor((v.length - 1) * 0.9)]);
  }
  const out: Para[] = [];
  let cur: Para | null = null;
  for (const it of placed) {
    const text = cleanLine(it.line.text);
    if (!text) continue;
    const m = Math.abs(it.line.size - body) < 1.5 ? MARKER.exec(text) : null;
    if (cur && !m && goesOn(cur, it, text)) {
      cur.text = joinWords(cur.text, text);
      cur.lines.push(it);
      continue;
    }
    cur = { text, size: it.line.size, page: it.page, lines: [it] };
    if (m) {
      const kind: ListKind = m[1] ? 'bullet' : m[2] ? 'check' : 'number';
      // Where its words start: the first character after its mark, as the page has it.
      const words = it.line.xs?.[[...text.slice(0, m[0].length)].length]?.[0] ?? it.line.x + m[0].length * it.line.size * 0.5;
      cur.text = text.slice(m[0].length);
      cur.list = { kind, at: it.line.x, words, ...(m[2] && /[☑☒✓✔]/.test(m[2]) ? { checked: true } : {}) };
    }
    out.push(cur);
  }
  return out;

  function goesOn(p: Para, it: Placed, text: string): boolean {
    const a = p.lines[p.lines.length - 1];
    const b = it.line;
    const s = p.size;
    if (Math.abs(b.size - s) > Math.max(0.6, 0.08 * Math.min(b.size, s))) return false;
    const prev = cleanLine(a.line.text);
    // A line goes on to the next only when the next one's first word would not have fitted after it: one that ends
    // short of its column's right edge ended its paragraph.
    const right = rights.get(`${a.page}|${a.col}`);
    const full = right === undefined || a.line.x + a.line.w >= right - (firstWord(b) + 1.5 * s);
    // Over a page's or a column's end: a sentence that goes on.
    if (it.page !== a.page || it.col !== a.col) return full && (!/[.!?:;"”’)\]]$/.test(prev) || /\p{L}-$/u.test(prev)) && /^[\p{Ll}\p{N}(]/u.test(text);
    const gap = b.base - a.line.base;
    const step = (lead * s) / body;
    if (gap < -1 || gap > step * 1.3) return false;
    // A line of words beside the one before (a table's cells): the same line.
    if (Math.abs(gap) <= 1) return true;
    // Lines centred one under the other (a title over two lines).
    if (Math.abs(a.line.x + a.line.w / 2 - (b.x + b.w / 2)) < Math.max(2, s * 0.3) && Math.abs(a.line.x - b.x) > s) return true;
    if (!full) return false;
    if (p.list) return Math.abs(b.x - p.list.words) <= Math.max(3, s * 0.4) || (b.x < p.list.words && b.x > p.list.at - 2);
    // Where its lines start in this column: its second line's place (the first may be set in, or hang out).
    const here = p.lines.filter((l) => l.page === it.page && l.col === it.col);
    const ref = here[0] === p.lines[0] ? here[1]?.line.x : here[0]?.line.x;
    if (ref !== undefined) return Math.abs(b.x - ref) <= 0.8 * s;
    // After a first line, one set in further starts a paragraph, unless the first ran to the edge (lines under a
    // hanging first one) and no sentence ended there.
    if (b.x > a.line.x + 0.8 * s) return right !== undefined && a.line.x + a.line.w >= right - 2 * s && !(/[.!?]["”’)]*$/.test(prev) && /^\p{Lu}/u.test(text));
    return true;
  }
}

/** How wide a line's first word is, as the page has it (or as wide as its letters usually are). */
function firstWord(l: PdfLine): number {
  const chars = [...l.text];
  let n = chars.indexOf(' ');
  if (n < 0) n = chars.length;
  const end = l.xs?.[n - 1]?.[1];
  const start = l.xs?.[0]?.[0];
  return end !== undefined && start !== undefined ? end - start : n * l.size * 0.5;
}

/** Paragraphs as blocks: the title, headings by their sizes, list items with their levels, and the rest. */
function blocksOf(paras: Para[], body: number): Record<string, unknown>[] {
  const big = (s: number) => s >= body * 1.12 && s - body >= 0.9;
  // Words that read as maths, often drawn larger, are no heading.
  const heading = (p: Para) => big(p.size) && p.text.length <= 300 && !/[=∑∫√≤≥≈≠∞]/.test(p.text);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const max = Math.max(...paras.map((p) => p.size));
  const firstBig = paras.findIndex((p) => near(p.size, max));
  const title = firstBig >= 0 && firstBig < 5 && paras[firstBig].page === 1 && heading(paras[firstBig]) && paras.filter((p) => near(p.size, max)).length === 1 ? firstBig : -1;
  // Headings' sizes, largest first, those within a little of each other one level.
  const sizes = [...new Set(paras.filter((p, i) => i !== title && heading(p)).map((p) => Math.round(p.size * 2) / 2))].sort((a, b) => b - a);
  const levels = new Map<number, number>();
  let level = 0;
  sizes.forEach((s, k) => {
    if (k && sizes[k - 1] - s > 0.75) level++;
    levels.set(s, Math.min(4, level + 1));
  });
  // List items' levels: within each run of them, by how far in their marks are.
  const lvl = new Map<number, number>();
  for (let i = 0; i < paras.length; ) {
    if (!paras[i].list) {
      i++;
      continue;
    }
    let j = i;
    while (j < paras.length && paras[j].list) j++;
    // Marks a little apart (a bullet centred where a number starts) are one level; a level is further in than that.
    const level = (a: number, b: number) => Math.abs(a - b) < Math.max(4, body * 0.8);
    const xs: number[] = [];
    for (const x of paras.slice(i, j).map((p) => p.list!.at).sort((a, b) => a - b)) if (!xs.some((y) => level(x, y))) xs.push(x);
    for (let k = i; k < j; k++) lvl.set(k, Math.min(4, xs.findIndex((x) => level(x, paras[k].list!.at))));
    i = j;
  }
  return paras.map((p, i) => {
    const runs = [{ t: p.text }];
    if (i === title) return { type: 'p', style: 'title', runs };
    const h = heading(p) ? levels.get(Math.round(p.size * 2) / 2) : undefined;
    if (h) return { type: 'p', style: `h${h}`, runs };
    if (p.list) return { type: 'li', list: p.list.kind, lvl: Math.max(0, lvl.get(i) ?? 0), ...(p.list.checked ? { checked: true } : {}), runs };
    return { type: 'p', runs };
  });
}
