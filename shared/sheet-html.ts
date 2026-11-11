// A table copied from Excel, Google Sheets, LibreOffice or a web page, read from the clipboard's HTML: each cell's words and
// the look it carried (bold, italic, underline, struck through, text and fill colours, alignment, and the number format
// where the source says one: Excel's mso-number-format, Google Sheets' data-sheets-numberformat). The values themselves
// are read from the clipboard's plain text, as typing would read them; this gives their looks (and the words, when the
// clipboard holds the table only as HTML). Excel keeps most of a cell's look in classes of a <style> block, Google
// Sheets and web pages in each cell's style: both are read. Nothing here needs a browser (no DOM): a small tolerant
// reader of tags, enough for the tables the clipboard holds.

import { cleanColor, cleanStyle, parseDelimited, type CellStyle } from './sheets.ts';

/** A cell of a pasted table: its words as shown, and its look (checked as a cell's style is). */
export interface HtmlCell {
  text: string;
  style?: CellStyle;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', euro: '€', pound: '£', yen: '¥', cent: '¢', copy: '©', reg: '®', deg: '°', times: '×', laquo: '«', raquo: '»' };

/** Text with its character references (&amp;, &#8364;, &#x20AC;) decoded. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? (n === 0xa0 ? ' ' : String.fromCodePoint(n)) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** A style's declarations ("font-weight:bold; color:red") as a map by lower-case name. */
function declarations(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of css.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).replace(/!important/gi, '').trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/** The rules of a <style> block that are for one class (".xl65 { … }", "td.xl65 { … }"), by class name. */
function classRules(html: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = m[1].replace(/<!--|-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const r of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const decl = declarations(r[2]);
      for (const sel of r[1].split(',')) {
        const c = /^\s*(?:td|th)?\.([\w-]+)\s*$/i.exec(sel);
        if (c) out.set(c[1], { ...out.get(c[1]), ...decl });
      }
    }
  }
  return out;
}

/** Excel's names for number formats, as the codes they stand for. */
const MSO_FORMATS: Record<string, string> = {
  general: '',
  'general number': '',
  'general date': 'yyyy-mm-dd hh:mm:ss',
  'short date': 'yyyy-mm-dd',
  'medium date': 'd mmm yyyy',
  'long date': 'dddd, d mmmm yyyy',
  'short time': 'hh:mm',
  'medium time': 'hh:mm:ss',
  'long time': 'hh:mm:ss',
  fixed: '0.00',
  standard: '#,##0.00',
  percent: '0.00%',
  scientific: '0.00E+00',
  'yes/no': '',
  'true/false': '',
  'on/off': '',
};

/** The number format code Excel's mso-number-format (`"\#\,\#\#0\.00"`, `Percent`, `\@`) stands for; '' for none. */
export function msoNumberFormat(v: string): string {
  const t = v.trim().replace(/^"(.*)"$/s, '$1');
  const key = t.toLowerCase();
  if (key in MSO_FORMATS) return MSO_FORMATS[key];
  return t.replace(/\\(.)/g, '$1');
}

/** A cell's number format code from Google Sheets' data-sheets-numberformat attribute (JSON: {"1":2,"2":"0.00%","3":1}), or ''. */
function sheetsNumberFormat(attrs: string): string {
  const m = /data-sheets-numberformat\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  if (!m) return '';
  try {
    const j = JSON.parse(decodeEntities(m[1] ?? m[2])) as { 2?: unknown };
    return typeof j[2] === 'string' ? j[2] : '';
  } catch {
    return '';
  }
}

/** Colours a source leaves to the reader: they mean the default, not a colour of their own. */
const DEFAULT_COLOUR = new Set(['windowtext', 'window', 'auto', 'automatic', 'inherit', 'initial', 'transparent', 'none', 'currentcolor', 'black', '#000000', '#000', 'rgb(0,0,0)', 'rgb(0, 0, 0)']);
const DEFAULT_FILL = new Set(['window', 'auto', 'automatic', 'inherit', 'initial', 'transparent', 'none', 'white', '#ffffff', '#fff', 'rgb(255,255,255)', 'rgb(255, 255, 255)']);

/** A look from declarations, as cleanStyle takes it (nothing the source leaves to the reader). */
function lookOf(d: Record<string, string>, sheetsNumber: string): CellStyle | undefined {
  const o: Record<string, unknown> = {};
  const w = (d['font-weight'] ?? '').toLowerCase();
  if (w === 'bold' || w === 'bolder' || Number(w) >= 600) o.b = true;
  if ((d['font-style'] ?? '').toLowerCase().includes('italic')) o.i = true;
  const deco = `${d['text-decoration'] ?? ''} ${d['text-decoration-line'] ?? ''}`.toLowerCase();
  if (deco.includes('underline') || (d['text-underline-style'] ?? 'none') !== 'none') o.u = true;
  if (deco.includes('line-through')) o.s = true;
  const color = d.color;
  if (color && !DEFAULT_COLOUR.has(color.toLowerCase()) && cleanColor(color)) o.color = cleanColor(color);
  const bg = d['background-color'] ?? d.background;
  const fill = bg && !DEFAULT_FILL.has(bg.toLowerCase().split(/\s+/)[0]) && !DEFAULT_FILL.has(bg.toLowerCase()) ? (cleanColor(bg) ?? cleanColor(bg.split(/\s+/)[0])) : null;
  if (fill) o.fill = fill;
  const align = (d['text-align'] ?? '').toLowerCase();
  if (align === 'left' || align === 'center' || align === 'right') o.align = align;
  if ((d['vertical-align'] ?? '').toLowerCase() === 'top') o.valign = 'top';
  const code = sheetsNumber || (d['mso-number-format'] ? msoNumberFormat(d['mso-number-format']) : '');
  if (code) o.code = code;
  return cleanStyle(o);
}

/** What is applied by a tag to the words inside it: bold, italic, underline, strike-through, a colour. */
interface Flags {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  color?: string;
}

const FLAG_TAGS: Record<string, keyof Flags> = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's' };

/** Whether the clipboard's HTML holds a table. */
export const hasHtmlTable = (html: string) => /<table[\s>]/i.test(html);

/** The words of HTML without its markup (for a clipboard that holds nothing else). */
export function htmlText(html: string): string {
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '');
  return decodeEntities(body.replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The first table of the HTML as rows of cells, each with its words and its look; null when it holds none. Cells that
 * span several columns or rows leave empty cells under and beside them, so every row lines up with the others.
 */
export function parseHtmlTable(html: string): HtmlCell[][] | null {
  if (!hasHtmlTable(html)) return null;
  const rules = classRules(html);
  const src = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<![^>]*>/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  const start = src.search(/<table[\s>]/i);
  const rows: HtmlCell[][] = [];
  let row: HtmlCell[] | null = null;
  // Columns held by a cell from a row above that spans down: [column, rows left].
  const down = new Map<number, number>();
  let depth = 0;
  let cell: { span: number; rowspan: number; decl: Record<string, string>; sheetsNumber: string; text: string; chunks: { text: string; flags: Flags }[] } | null = null;
  const stack: { tag: string; flags: Flags }[] = [];
  const flagsNow = (): Flags => stack.reduce<Flags>((a, x) => ({ ...a, ...x.flags }), {});
  const pushCell = () => {
    if (!cell || !row) return;
    const text = cell.text
      .replace(/[ \t\r\n\f\v]+/g, ' ')
      .replace(/ ?\u0001 ?/g, '\n')
      .trim();
    const decl = cell.decl;
    const chunks = cell.chunks.filter((c) => c.text.trim());
    const all = (k: keyof Flags) => chunks.length > 0 && chunks.every((c) => c.flags[k]);
    const tagged: Record<string, unknown> = {};
    for (const k of ['b', 'i', 'u', 's'] as const) if (all(k)) tagged[k] = true;
    const tagColour = chunks.length && chunks.every((c) => c.flags.color && c.flags.color === chunks[0].flags.color) ? chunks[0].flags.color : undefined;
    let style = lookOf(decl, cell.sheetsNumber);
    if (Object.keys(tagged).length || tagColour) style = cleanStyle({ ...style, ...tagged, ...(tagColour && !DEFAULT_COLOUR.has(tagColour.toLowerCase()) ? { color: tagColour } : {}) });
    // Columns held from above come first, then this cell, then the empty ones its width spans.
    while (down.has(row.length)) {
      const left = down.get(row.length)!;
      if (left <= 1) down.delete(row.length);
      else down.set(row.length, left - 1);
      row.push({ text: '' });
    }
    const col = row.length;
    row.push(style ? { text, style } : { text });
    for (let k = 1; k < cell.span; k++) {
      if (cell.rowspan > 1) down.set(col + k, cell.rowspan - 1);
      row.push({ text: '' });
    }
    if (cell.rowspan > 1) down.set(col, cell.rowspan - 1);
    cell = null;
  };
  const endRow = () => {
    pushCell();
    if (!row) return;
    // Cells held from above that no cell of this row came after.
    while (down.has(row.length)) {
      const left = down.get(row.length)!;
      if (left <= 1) down.delete(row.length);
      else down.set(row.length, left - 1);
      row.push({ text: '' });
    }
    rows.push(row);
    row = null;
  };
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g;
  tag.lastIndex = start;
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    if (m[4] !== undefined) {
      if (cell && depth === 1) {
        const t = decodeEntities(m[4]);
        cell.text += t;
        cell.chunks.push({ text: t, flags: flagsNow() });
      }
      continue;
    }
    if (!m[2]) continue;
    const close = m[1] === '/';
    const name = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    if (name === 'table') {
      if (close) {
        depth--;
        if (depth === 0) break;
      } else depth++;
      continue;
    }
    if (depth !== 1) continue;
    if (name === 'tr') {
      if (close) endRow();
      else {
        endRow();
        row = [];
      }
    } else if (name === 'td' || name === 'th') {
      if (close) {
        pushCell();
        stack.length = 0;
      } else {
        pushCell();
        row ??= [];
        stack.length = 0;
        const attr = (k: string) => new RegExp(`\\b${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
        const cls = attr('class');
        const style = attr('style');
        const span = attr('colspan');
        const rspan = attr('rowspan');
        const decl: Record<string, string> = {};
        for (const c of (cls?.[1] ?? cls?.[2] ?? cls?.[3] ?? '').split(/\s+/)) Object.assign(decl, rules.get(c));
        Object.assign(decl, declarations(decodeEntities(style?.[1] ?? style?.[2] ?? style?.[3] ?? '')));
        cell = {
          span: Math.max(1, Math.min(200, Number(span?.[1] ?? span?.[2] ?? span?.[3]) || 1)),
          rowspan: Math.max(1, Math.min(200, Number(rspan?.[1] ?? rspan?.[2] ?? rspan?.[3]) || 1)),
          decl,
          sheetsNumber: sheetsNumberFormat(attrs),
          text: '',
          chunks: [],
        };
        // A th is a header: bold, as browsers show it, unless its own style says otherwise.
        if (name === 'th' && !decl['font-weight']) decl['font-weight'] = 'bold';
      }
    } else if (cell) {
      if (name === 'br') cell.text += '\u0001';
      else if (FLAG_TAGS[name] || name === 'font' || name === 'span') {
        if (close) {
          for (let i = stack.length - 1; i >= 0; i--)
            if (stack[i].tag === name) {
              stack.length = i;
              break;
            }
        } else {
          const flags: Flags = {};
          const flag = FLAG_TAGS[name];
          if (flag && flag !== 'color') flags[flag] = true;
          const colour = /\bcolor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
          const st = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
          const d = st ? declarations(decodeEntities(st[1] ?? st[2])) : {};
          const c = colour?.[1] ?? colour?.[2] ?? colour?.[3] ?? d.color;
          if (c && cleanColor(c)) flags.color = cleanColor(c)!;
          const w = (d['font-weight'] ?? '').toLowerCase();
          if (w === 'bold' || Number(w) >= 600) flags.b = true;
          if ((d['font-style'] ?? '').toLowerCase().includes('italic')) flags.i = true;
          const deco = (d['text-decoration'] ?? '').toLowerCase();
          if (deco.includes('underline')) flags.u = true;
          if (deco.includes('line-through')) flags.s = true;
          if (!/\/\s*$/.test(attrs)) stack.push({ tag: name, flags });
        }
      }
    }
  }
  endRow();
  return rows.length ? rows : null;
}

/** A parsed table as tab-separated text (cells with tabs, quotes or new lines quoted), for a clipboard that holds only HTML. */
export function tableText(rows: HtmlCell[][]): string {
  return rows.map((r) => r.map((c) => (/[\t\n"]/.test(c.text) ? `"${c.text.replace(/"/g, '""')}"` : c.text)).join('\t')).join('\n');
}

/**
 * The looks of a pasted table cell by cell, for the cells of its plain text (tab-separated): when the HTML holds a table
 * of the same size, else null (it is not the same data: no looks are guessed).
 */
export function looksFor(text: string, html: string): (CellStyle | undefined)[][] | null {
  const table = parseHtmlTable(html);
  if (!table) return null;
  const rows = parseDelimited(text.replace(/\r?\n$/, ''), '\t').rows;
  const width = (r: unknown[][]) => Math.max(0, ...r.map((x) => x.length));
  if (table.length !== rows.length || width(table) !== width(rows)) return null;
  const out = table.map((r) => r.map((c) => c.style));
  return out.some((r) => r.some(Boolean)) ? out : null;
}
