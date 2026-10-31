// Word, Excel and PowerPoint files (Office Open XML): zips of XML parts linked by relationships.
// Word: headings, paragraphs, numbered and bulleted lists, tables, links, images by their alt text,
// text boxes, footnotes and comments. Excel: each sheet's cells with numbers roughly as formatted, and
// some of its formulas. PowerPoint: each slide's title, text, tables, pictures and charts, and notes.
import type { Block, DocModel, DocPart, SheetCells } from '../../shared/documents.ts';
import { all, att, isEl, kid, kids, parseXml, patt, path, scan, textOf, type El } from './xml.ts';
import { resolvePart, type Zip } from './zip.ts';
import { blockPlain, Budget, colIndex, colName, Spans, type Fmt } from './model.ts';
import { BUILTIN_FORMATS, formatNumber } from './numfmt.ts';

interface Rel {
  type: string;
  target: string;
  external: boolean;
}

/** A part's relationships, by id; targets resolved to part names (or left as addresses). */
export function rels(zip: Zip, part: string): Map<string, Rel> {
  const slash = part.lastIndexOf('/');
  const file = `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
  const out = new Map<string, Rel>();
  const xml = zip.text(file);
  if (!xml) return out;
  for (const r of all(parseXml(xml).root, 'Relationship')) {
    const external = att(r, 'TargetMode') === 'External';
    const target = att(r, 'Target') ?? '';
    out.set(att(r, 'Id') ?? '', { type: (att(r, 'Type') ?? '').split('/').pop() ?? '', target: external ? target : resolvePart(part, target), external });
  }
  return out;
}

const relOfType = (r: Map<string, Rel>, type: string) => [...r.values()].find((x) => x.type === type);

/** The package's main part (word/document.xml…), from its root relationships. */
function mainPart(zip: Zip, fallback: string): string {
  const t = relOfType(rels(zip, ''), 'officeDocument')?.target;
  return t && zip.has(t) ? t : fallback;
}

function coreTitle(zip: Zip): string | undefined {
  const xml = zip.text('docProps/core.xml');
  const t = xml ? textOf(kid(parseXml(xml).root, 'title')).trim() : '';
  return t || undefined;
}

const onOff = (el: El | undefined): boolean | undefined => (el ? !['0', 'false', 'off'].includes(att(el, 'val') ?? '') : undefined);

/** Only safe addresses become links: the web and mail. */
const safeHref = (u: string | undefined) => (u && /^(https?:|mailto:)/i.test(u.trim()) ? u.trim() : undefined);

// ---- Word -----------------------------------------------------------------------------------------

interface PStyle {
  name: string;
  basedOn?: string;
  outline?: number;
  numId?: string;
  ilvl?: number;
  b?: boolean;
  i?: boolean;
}

interface Level {
  fmt: string;
  text: string;
  start: number;
}

interface DocxCtx {
  rels: Map<string, Rel>;
  styles: Map<string, PStyle>;
  nums: Map<string, Map<number, Level>>;
  counters: Map<string, number[]>;
  budget: Budget;
  depth: number;
}

function docxStyles(xml: string | null): Map<string, PStyle> {
  const out = new Map<string, PStyle>();
  if (!xml) return out;
  for (const s of all(parseXml(xml).root, 'style')) {
    const id = att(s, 'styleId');
    if (!id) continue;
    const pPr = kid(s, 'pPr');
    const numPr = kid(pPr, 'numPr');
    const rPr = kid(s, 'rPr');
    const outline = att(kid(pPr, 'outlineLvl'), 'val');
    out.set(id, {
      name: att(kid(s, 'name'), 'val') ?? id,
      basedOn: att(kid(s, 'basedOn'), 'val'),
      outline: outline !== undefined ? Number(outline) : undefined,
      numId: att(kid(numPr, 'numId'), 'val'),
      ilvl: att(kid(numPr, 'ilvl'), 'val') !== undefined ? Number(att(kid(numPr, 'ilvl'), 'val')) : undefined,
      b: onOff(kid(rPr, 'b')),
      i: onOff(kid(rPr, 'i')),
    });
  }
  return out;
}

function docxNumbering(xml: string | null): Map<string, Map<number, Level>> {
  const out = new Map<string, Map<number, Level>>();
  if (!xml) return out;
  const root = parseXml(xml).root;
  const abstract = new Map<string, Map<number, Level>>();
  for (const a of kids(root, 'abstractNum')) {
    const lv = new Map<number, Level>();
    for (const l of kids(a, 'lvl'))
      lv.set(Number(att(l, 'ilvl') ?? 0), { fmt: att(kid(l, 'numFmt'), 'val') ?? 'decimal', text: att(kid(l, 'lvlText'), 'val') ?? '', start: Number(att(kid(l, 'start'), 'val') ?? 1) });
    abstract.set(att(a, 'abstractNumId') ?? '', lv);
  }
  for (const n of kids(root, 'num')) {
    const base = abstract.get(att(kid(n, 'abstractNumId'), 'val') ?? '') ?? new Map<number, Level>();
    const lv = new Map(base);
    for (const o of kids(n, 'lvlOverride')) {
      const i = Number(att(o, 'ilvl') ?? 0);
      const start = att(kid(o, 'startOverride'), 'val');
      const l = kid(o, 'lvl');
      if (l) lv.set(i, { fmt: att(kid(l, 'numFmt'), 'val') ?? 'decimal', text: att(kid(l, 'lvlText'), 'val') ?? '', start: Number(att(kid(l, 'start'), 'val') ?? 1) });
      else if (start !== undefined && lv.get(i)) lv.set(i, { ...lv.get(i)!, start: Number(start) });
    }
    out.set(att(n, 'numId') ?? '', lv);
  }
  return out;
}

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

export function numberAs(n: number, fmt: string): string {
  switch (fmt) {
    case 'lowerLetter':
      return letters(n);
    case 'upperLetter':
      return letters(n).toUpperCase();
    case 'lowerRoman':
      return roman(n);
    case 'upperRoman':
      return roman(n).toUpperCase();
    case 'decimalZero':
      return String(n).padStart(2, '0');
    default:
      return String(n);
  }
}

/** A list item's number ("2.", "b)", "1.3."), counting on from the list's earlier items; none for bullets. */
function listNumber(ctx: DocxCtx, numId: string, ilvl: number): string | undefined {
  const lv = ctx.nums.get(numId);
  const l = lv?.get(ilvl);
  if (!lv || !l || l.fmt === 'bullet' || l.fmt === 'none') return undefined;
  let c = ctx.counters.get(numId);
  if (!c) ctx.counters.set(numId, (c = []));
  c[ilvl] = (c[ilvl] ?? (lv.get(ilvl)?.start ?? 1) - 1) + 1;
  c.length = ilvl + 1;
  const label = (l.text || `%${ilvl + 1}.`).replace(/%(\d)/g, (_m, d: string) => {
    const k = Number(d) - 1;
    return numberAs(c![k] ?? lv.get(k)?.start ?? 1, lv.get(k)?.fmt ?? 'decimal');
  });
  return label.trim() || undefined;
}

function styleChain(ctx: DocxCtx, id: string | undefined): PStyle[] {
  const out: PStyle[] = [];
  for (let k = 0; id && k < 8; k++) {
    const s = ctx.styles.get(id);
    if (!s) break;
    out.push(s);
    id = s.basedOn;
  }
  return out;
}

function headingLevel(ctx: DocxCtx, styleId: string | undefined, pPr: El | undefined): number {
  const direct = att(kid(pPr, 'outlineLvl'), 'val');
  if (direct !== undefined && Number(direct) < 9) return Number(direct) + 1;
  for (const s of styleChain(ctx, styleId)) {
    const m = /^heading\s*(\d)/i.exec(s.name);
    if (m) return Number(m[1]);
    if (/^title$/i.test(s.name)) return 1;
    if (s.outline !== undefined && s.outline < 9) return s.outline + 1;
  }
  const m = /^heading(\d)$/i.exec(styleId ?? '');
  return m ? Number(m[1]) : styleId === 'Title' ? 1 : 0;
}

function numbering(ctx: DocxCtx, styleId: string | undefined, pPr: El | undefined): { numId: string; ilvl: number } | null {
  const numPr = kid(pPr, 'numPr');
  let numId = att(kid(numPr, 'numId'), 'val');
  let ilvl = att(kid(numPr, 'ilvl'), 'val') !== undefined ? Number(att(kid(numPr, 'ilvl'), 'val')) : undefined;
  if (numId === undefined)
    for (const s of styleChain(ctx, styleId))
      if (s.numId !== undefined) {
        numId = s.numId;
        ilvl ??= s.ilvl;
        break;
      }
  return numId && numId !== '0' ? { numId, ilvl: Math.min(ilvl ?? 0, 8) } : null;
}

interface Inline {
  spans: Spans;
  /** Text boxes met inside the paragraph: their paragraphs come after it. */
  boxes: El[];
  images: (string | undefined)[];
}

/** What a drawing is: text boxes, a picture (by its description) or a chart. */
function drawing(x: El, into: Inline) {
  const boxes = all(x, 'txbxContent');
  if (boxes.length) {
    into.boxes.push(...boxes);
    return;
  }
  const pr = all(x, 'docPr')[0] ?? all(x, 'cNvPr')[0];
  const alt = (att(pr, 'descr') || att(pr, 'title') || '').trim() || undefined;
  if (all(x, 'chart').length) into.images.push(alt ? `Chart: ${alt}` : 'Chart');
  else if (all(x, 'blip').length || all(x, 'imagedata').length || all(x, 'pic').length) into.images.push(alt);
}

function runContent(nodes: El['c'], ctx: DocxCtx, f: Fmt, into: Inline) {
  for (const x of nodes) {
    if (!isEl(x)) continue;
    switch (x.n) {
      case 't':
        into.spans.add(textOf(x), f);
        break;
      case 'tab':
      case 'ptab':
        into.spans.add('\t', f);
        break;
      case 'br':
      case 'cr':
        if (att(x, 'type') !== 'page' && att(x, 'type') !== 'column') into.spans.add('\n', f);
        break;
      case 'noBreakHyphen':
        into.spans.add('-', f);
        break;
      case 'footnoteReference':
      case 'endnoteReference':
        into.spans.add(`[^${x.n === 'endnoteReference' ? 'e' : ''}${att(x, 'id') ?? ''}]`, f);
        break;
      case 'drawing':
      case 'pict':
      case 'object':
        drawing(x, into);
        break;
      case 'AlternateContent': {
        const choice = kid(x, 'Choice') ?? kid(x, 'Fallback');
        if (choice) runContent(choice.c, ctx, f, into);
        break;
      }
    }
  }
}

function run(r: El, ctx: DocxCtx, f: Fmt, into: Inline) {
  const rPr = kid(r, 'rPr');
  const style = ctx.styles.get(att(kid(rPr, 'rStyle'), 'val') ?? '');
  const named = style?.name.toLowerCase();
  const b = onOff(kid(rPr, 'b')) ?? style?.b ?? (named === 'strong' ? true : undefined) ?? f.b;
  const i = onOff(kid(rPr, 'i')) ?? style?.i ?? (named === 'emphasis' ? true : undefined) ?? f.i;
  runContent(r.c, ctx, { b, i, href: f.href }, into);
}

function inline(el: El, ctx: DocxCtx, f: Fmt, into: Inline) {
  for (const x of el.c) {
    if (!isEl(x)) continue;
    switch (x.n) {
      case 'r':
        run(x, ctx, f, into);
        break;
      case 'hyperlink': {
        const rel = ctx.rels.get(patt(x, 'id') ?? '');
        inline(x, ctx, { ...f, href: (rel?.external ? safeHref(rel.target) : undefined) ?? f.href }, into);
        break;
      }
      case 'sdt':
        inline(kid(x, 'sdtContent') ?? x, ctx, f, into);
        break;
      case 'ins':
      case 'moveTo':
      case 'smartTag':
      case 'customXml':
      case 'fldSimple':
      case 'sdtContent':
      case 'dir':
      case 'bdo':
        inline(x, ctx, f, into);
        break;
      case 'oMath':
      case 'oMathPara':
        into.spans.add(
          all(x, 't')
            .map((t) => textOf(t))
            .join(''),
          f,
        );
        break;
      case 'AlternateContent': {
        const choice = kid(x, 'Choice') ?? kid(x, 'Fallback');
        if (choice) inline(choice, ctx, f, into);
        break;
      }
    }
  }
}

function paragraph(p: El, ctx: DocxCtx, out: Block[]) {
  const pPr = kid(p, 'pPr');
  const styleId = att(kid(pPr, 'pStyle'), 'val');
  const into: Inline = { spans: new Spans(ctx.budget), boxes: [], images: [] };
  inline(p, ctx, {}, into);
  const s = into.spans.done();
  if (s.length) {
    const level = headingLevel(ctx, styleId, pPr);
    const num = level ? null : numbering(ctx, styleId, pPr);
    if (level) out.push({ k: 'h', level, s });
    else if (num) {
      const n = listNumber(ctx, num.numId, num.ilvl);
      out.push({ k: 'li', level: num.ilvl, ...(n ? { n } : {}), s });
    } else out.push({ k: 'p', s });
  }
  for (const alt of into.images) out.push({ k: 'img', ...(alt ? { alt } : {}) });
  if (ctx.depth < 6) {
    ctx.depth++;
    for (const box of into.boxes) body(box, ctx, out);
    ctx.depth--;
  }
}

function table(tbl: El, ctx: DocxCtx): Block {
  const rows: string[][] = [];
  const cellsOf = (el: El): El[] => kids(el).flatMap((x) => (x.n === 'tc' ? [x] : x.n === 'sdt' || x.n === 'sdtContent' || x.n === 'customXml' ? cellsOf(x) : []));
  const rowsOf = (el: El): El[] => kids(el).flatMap((x) => (x.n === 'tr' ? [x] : x.n === 'sdt' || x.n === 'sdtContent' || x.n === 'customXml' ? rowsOf(x) : []));
  for (const tr of rowsOf(tbl)) {
    if (ctx.budget.cut) break;
    const row: string[] = [];
    for (const tc of cellsOf(tr)) {
      const blocks: Block[] = [];
      ctx.depth++;
      if (ctx.depth < 6) body(tc, ctx, blocks);
      ctx.depth--;
      row.push(blocks.map(blockPlain).join('\n'));
      const span = Number(att(path(tc, 'tcPr', 'gridSpan'), 'val')) || 1;
      for (let k = 1; k < Math.min(span, 64); k++) row.push('');
    }
    rows.push(row);
  }
  return { k: 'table', rows };
}

function body(el: El, ctx: DocxCtx, out: Block[]) {
  for (const x of el.c) {
    if (!isEl(x) || ctx.budget.cut) continue;
    switch (x.n) {
      case 'p':
        paragraph(x, ctx, out);
        break;
      case 'tbl':
        out.push(table(x, ctx));
        break;
      case 'sdt':
        body(kid(x, 'sdtContent') ?? x, ctx, out);
        break;
      case 'customXml':
      case 'ins':
      case 'moveTo':
      case 'sdtContent':
        body(x, ctx, out);
        break;
      case 'AlternateContent': {
        const choice = kid(x, 'Choice') ?? kid(x, 'Fallback');
        if (choice) body(choice, ctx, out);
        break;
      }
    }
  }
}

/** Footnotes or endnotes, each a paragraph starting with its mark. */
function notesPart(zip: Zip, part: string | undefined, ctx: DocxCtx, tag: string, mark: string): Block[] {
  const xml = part ? zip.text(part) : null;
  if (!xml) return [];
  const out: Block[] = [];
  for (const n of all(parseXml(xml).root, tag)) {
    if (['separator', 'continuationSeparator', 'continuationNotice'].includes(att(n, 'type') ?? '')) continue;
    const blocks: Block[] = [];
    body(n, ctx, blocks);
    const text = blocks.map(blockPlain).join(' ').trim();
    if (text) out.push({ k: 'p', s: [{ t: `[^${mark}${att(n, 'id') ?? ''}]: ${text}` }] });
  }
  return out;
}

export function readDocx(zip: Zip, budget: Budget): DocModel {
  const main = mainPart(zip, 'word/document.xml');
  const xml = zip.text(main);
  if (!xml) throw new Error('This Word file has no document in it');
  const r = rels(zip, main);
  const part = (type: string) => relOfType(r, type)?.target;
  const styles = docxStyles(zip.text(part('styles') ?? 'word/styles.xml'));
  const nums = docxNumbering(zip.text(part('numbering') ?? 'word/numbering.xml'));
  const ctx: DocxCtx = { rels: r, styles, nums, counters: new Map(), budget, depth: 0 };
  const { root, cut } = parseXml(xml);
  const blocks: Block[] = [];
  body(path(root, 'body') ?? root, ctx, blocks);
  const parts: DocPart[] = [{ kind: 'body', blocks }];
  const foot = notesPart(zip, part('footnotes'), ctx, 'footnote', '');
  if (foot.length) parts.push({ kind: 'extra', title: 'Footnotes', blocks: foot });
  const end = notesPart(zip, part('endnotes'), ctx, 'endnote', 'e');
  if (end.length) parts.push({ kind: 'extra', title: 'Endnotes', blocks: end });
  const cm = part('comments') ? zip.text(part('comments')!) : null;
  if (cm) {
    const list: Block[] = [];
    for (const c of all(parseXml(cm).root, 'comment')) {
      const inner: Block[] = [];
      body(c, ctx, inner);
      const text = inner.map(blockPlain).join(' ').trim();
      if (text) list.push({ k: 'li', level: 0, s: [{ t: `${att(c, 'author') ?? 'Someone'}:`, b: 1 }, { t: ` ${text}` }] });
    }
    if (list.length) parts.push({ kind: 'extra', title: 'Comments', blocks: list });
  }
  return { format: 'docx', title: coreTitle(zip), parts, notes: cut ? ['The document is very large: only its first part was read.'] : [] };
}

// ---- Excel ----------------------------------------------------------------------------------------

export interface SheetLimits {
  rows: number;
  cols: number;
}

function sharedStrings(xml: string | null): string[] {
  const out: string[] = [];
  if (!xml) return out;
  let cur: string | null = null;
  let inT = false;
  let phonetic = 0;
  scan(xml, {
    open(n, _a, self) {
      if (n === 'si') cur = '';
      else if (n === 'rPh' && !self) phonetic++;
      else if (n === 't' && cur !== null && !phonetic && !self) inT = true;
    },
    text(t) {
      if (inT) cur += t;
    },
    close(n) {
      if (n === 't') inT = false;
      else if (n === 'rPh') phonetic = Math.max(0, phonetic - 1);
      else if (n === 'si') {
        out.push(cur ?? '');
        cur = null;
      }
    },
  });
  return out;
}

/** Each cell style's number format code, by the style's index. */
function cellFormats(xml: string | null): (string | undefined)[] {
  if (!xml) return [];
  const root = parseXml(xml).root;
  const custom = new Map<number, string>();
  for (const f of all(kid(root, 'numFmts'), 'numFmt')) custom.set(Number(att(f, 'numFmtId')), att(f, 'formatCode') ?? '');
  return kids(kid(root, 'cellXfs'), 'xf').map((xf) => {
    const id = Number(att(xf, 'numFmtId') ?? 0);
    return custom.get(id) ?? BUILTIN_FORMATS[id];
  });
}

function readSheet(xml: string, shared: string[], formats: (string | undefined)[], date1904: boolean, lim: SheetLimits, budget: Budget, cut: boolean): SheetCells {
  const rows: { n: number; cells: Map<number, string> }[] = [];
  const formulas: [string, string][] = [];
  let row: { n: number; cells: Map<number, string> } | null = null;
  let rowN = 0;
  let colN = -1;
  let cur: { ref?: string; t?: string; s?: string; v: string; f: string; is: string } | null = null;
  let field: 'v' | 'f' | 't' | null = null;
  let inIs = false;
  let phonetic = 0;
  let minCol = Infinity;
  let maxCol = -1;
  let dim: string | undefined;
  let more = false;
  scan(xml, {
    open(n, a, self) {
      if (n === 'row') {
        if (rows.length >= lim.rows || budget.cut) return ((more = true), false);
        rowN = Number(a.r) || rowN + 1;
        colN = -1;
        row = { n: rowN, cells: new Map() };
      } else if (n === 'c') {
        colN = a.r ? colIndex(a.r) : colN + 1;
        cur = { ref: a.r, t: a.t, s: a.s, v: '', f: '', is: '' };
      } else if (n === 'dimension') dim = a.ref;
      else if (cur && !self) {
        if (n === 'v') field = 'v';
        else if (n === 'f') field = 'f';
        else if (n === 'is') inIs = true;
        else if (n === 'rPh') phonetic++;
        else if (n === 't' && inIs && !phonetic) field = 't';
      }
    },
    text(t) {
      if (!cur || !field) return;
      if (field === 'v') cur.v += t;
      else if (field === 'f') cur.f += t;
      else cur.is += t;
    },
    close(n) {
      if (n === 'v' || n === 'f' || n === 't') field = null;
      else if (n === 'is') inIs = false;
      else if (n === 'rPh') phonetic = Math.max(0, phonetic - 1);
      else if (n === 'c' && cur && row) {
        let v: string;
        switch (cur.t) {
          case 's':
            v = shared[Number(cur.v)] ?? '';
            break;
          case 'str':
          case 'e':
            v = cur.v;
            break;
          case 'inlineStr':
            v = cur.is;
            break;
          case 'b':
            v = cur.v === '1' ? 'TRUE' : cur.v ? 'FALSE' : '';
            break;
          case 'd':
            v = cur.v.replace(/T00:00:00(\.0+)?Z?$/, '');
            break;
          default: {
            const num = Number(cur.v);
            v = cur.v === '' ? '' : Number.isNaN(num) ? cur.v : formatNumber(num, formats[Number(cur.s) || 0], date1904);
          }
        }
        // A formula never calculated (written by a script): show the formula itself.
        if (!v && cur.f) v = `=${cur.f}`;
        if (cur.f && formulas.length < 40) formulas.push([cur.ref ?? `${colName(colN)}${rowN}`, `=${cur.f}`]);
        if (v) {
          budget.take(v.length + 3);
          row.cells.set(colN, v);
          if (colN < minCol) minCol = colN;
          if (colN > maxCol) maxCol = colN;
        }
        cur = null;
      } else if (n === 'row' && row) {
        if (row.cells.size) rows.push(row);
        row = null;
      }
    },
  });
  if (minCol === Infinity) minCol = 0;
  // The sheet's XML was cut short: there is more than was read.
  if (cut) more = true;
  const width = Math.min(maxCol - minCol + 1, lim.cols);
  const span = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(dim ?? '');
  const lastRow = span ? Number(span[4] ?? span[2]) : 0;
  return {
    col: minCol,
    rows: rows.map((r) => ({ n: r.n, c: Array.from({ length: Math.max(0, width) }, (_, k) => r.cells.get(minCol + k) ?? '') })),
    totalRows: more ? Math.max(rows.length, lastRow - (rows[0]?.n ?? 1) + 1) : rows.length,
    totalCols: Math.max(0, maxCol - minCol + 1),
    ...(more ? { more } : {}),
    ...(formulas.length ? { formulas } : {}),
  };
}

export function readXlsx(zip: Zip, budget: Budget, lim: SheetLimits): DocModel {
  const main = mainPart(zip, 'xl/workbook.xml');
  const xml = zip.text(main);
  if (!xml) throw new Error('This Excel file has no workbook in it');
  const wb = parseXml(xml).root;
  const r = rels(zip, main);
  const date1904 = ['1', 'true'].includes(att(kid(wb, 'workbookPr'), 'date1904') ?? '');
  const shared = sharedStrings(zip.text(relOfType(r, 'sharedStrings')?.target ?? 'xl/sharedStrings.xml'));
  const formats = cellFormats(zip.text(relOfType(r, 'styles')?.target ?? 'xl/styles.xml'));
  const parts: DocPart[] = [];
  const notes: string[] = [];
  for (const s of all(kid(wb, 'sheets'), 'sheet')) {
    const name = att(s, 'name') ?? `Sheet ${parts.length + 1}`;
    const hidden = (att(s, 'state') ?? 'visible') !== 'visible';
    const rel = r.get(patt(s, 'id') ?? '');
    if (budget.cut) {
      notes.push(`Sheet “${name}” and those after it were left out: the workbook has more text than this reads at once.`);
      break;
    }
    if (rel?.type === 'chartsheet') {
      parts.push({ kind: 'sheet', title: name, hidden, blocks: [{ k: 'img', alt: 'A chart sheet' }] });
      continue;
    }
    // The first rows are all that is shown: a sheet's first 32 MB of XML hold thousands of them.
    const sx = rel ? zip.text(rel.target, 32 * 1024 * 1024) : null;
    if (!sx) continue;
    const cells = readSheet(sx, shared, formats, date1904, lim, budget, zip.cut.has(zip.find(rel!.target) ?? ""));
    if (cells.more) notes.push(`Sheet “${name}” shows its first ${cells.rows.length} rows${cells.totalRows > cells.rows.length ? ` of about ${cells.totalRows}` : '; it has more'}.`);
    if (cells.totalCols > lim.cols) notes.push(`Sheet “${name}” shows its first ${lim.cols} of ${cells.totalCols} columns.`);
    parts.push({ kind: 'sheet', title: name, hidden, blocks: [], cells });
  }
  return { format: 'xlsx', title: coreTitle(zip), parts, notes };
}

// ---- PowerPoint -----------------------------------------------------------------------------------

/** A text body's paragraphs: as list items where the shape shows bullets, else as paragraphs. */
function textBody(tx: El | undefined, bullets: boolean, out: Block[], budget: Budget, links?: Map<string, Rel>) {
  const counters: number[] = [];
  for (const p of kids(tx, 'p')) {
    const pPr = kid(p, 'pPr');
    const lvl = Math.min(Number(att(pPr, 'lvl')) || 0, 8);
    const sp = new Spans(budget);
    const walk = (el: El) => {
      for (const x of el.c) {
        if (!isEl(x)) continue;
        if (x.n === 'r' || x.n === 'fld') {
          const rPr = kid(x, 'rPr');
          const href = links ? safeHref(links.get(patt(kid(rPr, 'hlinkClick'), 'id') ?? '')?.target) : undefined;
          sp.add(textOf(kid(x, 't')), { b: att(rPr, 'b') === '1' || att(rPr, 'b') === 'true', i: att(rPr, 'i') === '1' || att(rPr, 'i') === 'true', href });
        } else if (x.n === 'br') sp.add('\n');
        else if (x.n === 'AlternateContent') {
          const c = kid(x, 'Choice') ?? kid(x, 'Fallback');
          if (c) walk(c);
        }
      }
    };
    walk(p);
    const s = sp.done();
    if (!s.length) continue;
    const auto = kid(pPr, 'buAutoNum');
    const listed = !kid(pPr, 'buNone') && (bullets || !!kid(pPr, 'buChar') || !!auto);
    if (listed) {
      counters[lvl] = (counters[lvl] ?? (Number(att(auto, 'startAt')) || 1) - 1) + 1;
      counters.length = lvl + 1;
      const scheme = att(auto, 'type') ?? '';
      const n = auto ? `${numberAs(counters[lvl], /alphaLc/.test(scheme) ? 'lowerLetter' : /alphaUc/.test(scheme) ? 'upperLetter' : /romanLc/.test(scheme) ? 'lowerRoman' : /romanUc/.test(scheme) ? 'upperRoman' : 'decimal')}${/Paren/.test(scheme) ? ')' : '.'}` : undefined;
      out.push({ k: 'li', level: lvl, ...(n ? { n } : {}), s });
    } else out.push({ k: 'p', s });
  }
}

function chartText(zip: Zip, part: string | undefined): string {
  const xml = part ? zip.text(part) : null;
  if (!xml) return 'Chart';
  const root = parseXml(xml).root;
  const title = all(kid(all(root, 'chart')[0], 'title'), 't')
    .map((t) => textOf(t))
    .join('')
    .trim();
  const series = all(root, 'ser')
    .map((s) => textOf(all(kid(s, 'tx'), 'v')[0]).trim())
    .filter(Boolean);
  return `Chart${title ? `: ${title}` : ''}${series.length ? ` (series: ${series.slice(0, 8).join(', ')})` : ''}`;
}

function shapes(tree: El | undefined, zip: Zip, sr: Map<string, Rel>, budget: Budget, slide: { title?: string; blocks: Block[] }, depth = 0) {
  if (!tree || depth > 8) return;
  for (const x of kids(tree)) {
    if (budget.cut) return;
    if (x.n === 'sp') {
      const ph = path(x, 'nvSpPr', 'nvPr', 'ph');
      const type = ph ? (att(ph, 'type') ?? 'body') : undefined;
      if (type && ['dt', 'ftr', 'sldNum', 'hdr', 'sldImg'].includes(type)) continue;
      const tx = kid(x, 'txBody');
      if ((type === 'title' || type === 'ctrTitle') && !slide.title) {
        const blocks: Block[] = [];
        textBody(tx, false, blocks, budget);
        const t = blocks.map(blockPlain).join('\n').trim();
        if (t) slide.title = t;
        continue;
      }
      textBody(tx, type === 'body' || type === 'obj', slide.blocks, budget, sr);
    } else if (x.n === 'grpSp') shapes(x, zip, sr, budget, slide, depth + 1);
    else if (x.n === 'graphicFrame') {
      const data = path(x, 'graphic', 'graphicData');
      const tbl = kid(data, 'tbl');
      if (tbl) {
        const rows = kids(tbl, 'tr').map((tr) =>
          kids(tr, 'tc').map((tc) => {
            if (att(tc, 'hMerge') === '1' || att(tc, 'vMerge') === '1') return '';
            const blocks: Block[] = [];
            textBody(kid(tc, 'txBody'), false, blocks, budget);
            return blocks.map(blockPlain).join('\n');
          }),
        );
        slide.blocks.push({ k: 'table', rows });
      } else if (kid(data, 'chart')) slide.blocks.push({ k: 'img', alt: chartText(zip, sr.get(patt(kid(data, 'chart'), 'id') ?? '')?.target) });
      else if (all(data, 'blip').length) slide.blocks.push({ k: 'img' });
    } else if (x.n === 'pic') {
      const pr = path(x, 'nvPicPr', 'cNvPr');
      const alt = (att(pr, 'descr') || att(pr, 'title') || '').trim();
      slide.blocks.push({ k: 'img', ...(alt ? { alt } : {}) });
    } else if (x.n === 'AlternateContent') {
      const c = kid(x, 'Choice') ?? kid(x, 'Fallback');
      if (c) shapes(c, zip, sr, budget, slide, depth + 1);
    }
  }
}

export function readPptx(zip: Zip, budget: Budget, maxSlides = 1000): DocModel {
  const main = mainPart(zip, 'ppt/presentation.xml');
  const xml = zip.text(main);
  if (!xml) throw new Error('This PowerPoint file has no presentation in it');
  const pres = parseXml(xml).root;
  const r = rels(zip, main);
  const parts: DocPart[] = [];
  const notes: string[] = [];
  const list = kids(kid(pres, 'sldIdLst'), 'sldId')
    .map((s) => r.get(patt(s, 'id') ?? '')?.target)
    .filter((t): t is string => !!t);
  for (const target of list.slice(0, maxSlides)) {
    if (budget.cut) {
      notes.push(`Slides after ${parts.length} were left out: the presentation has more text than this reads at once.`);
      break;
    }
    const sx = zip.text(target);
    if (!sx) continue;
    const sld = parseXml(sx).root;
    const sr = rels(zip, target);
    const slide: { title?: string; blocks: Block[] } = { blocks: [] };
    shapes(path(sld, 'cSld', 'spTree'), zip, sr, budget, slide);
    const notesPart = relOfType(sr, 'notesSlide')?.target;
    const nx = notesPart ? zip.text(notesPart) : null;
    const said: Block[] = [];
    if (nx)
      for (const sp of all(parseXml(nx).root, 'sp')) {
        const ph = path(sp, 'nvSpPr', 'nvPr', 'ph');
        if (ph && (att(ph, 'type') ?? 'body') === 'body') textBody(kid(sp, 'txBody'), false, said, budget);
      }
    parts.push({ kind: 'slide', title: slide.title, hidden: att(sld, 'show') === '0' || undefined, blocks: slide.blocks, ...(said.length ? { notes: said } : {}) });
  }
  if (list.length > maxSlides) notes.push(`The first ${maxSlides} of ${list.length} slides were read.`);
  return { format: 'pptx', title: coreTitle(zip), parts, notes };
}
