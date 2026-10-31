// OpenDocument files (LibreOffice's own: .odt, .ods, .odp): one content.xml with the text, sheets or
// slides. Text: headings, paragraphs, lists (numbered where their style says), tables, links, images
// by their title, footnotes. Sheets: each table's cells as displayed. Slides: titles, text and notes.
import type { Block, DocModel, DocPart } from '../../shared/documents.ts';
import { all, att, isEl, kid, kids, parseXml, textOf, type El } from './xml.ts';
import type { Zip } from './zip.ts';
import { blockPlain, Budget, colName, Spans, type Fmt } from './model.ts';
import { numberAs } from './ooxml.ts';
import type { SheetLimits } from './ooxml.ts';

interface Ctx {
  /** Text styles that are bold or italic, by name. */
  looks: Map<string, Fmt>;
  /** List styles, by name: whether each level is numbered, and how. */
  lists: Map<string, Map<number, { fmt: string; suffix: string } | null>>;
  budget: Budget;
  footnotes: Block[];
  depth: number;
}

const safeHref = (u: string | undefined) => (u && /^(https?:|mailto:)/i.test(u.trim()) ? u.trim() : undefined);

function styles(roots: El[]): Pick<Ctx, 'looks' | 'lists'> {
  const looks = new Map<string, Fmt>();
  const lists = new Map<string, Map<number, { fmt: string; suffix: string } | null>>();
  for (const root of roots) {
    for (const s of all(root, 'style')) {
      const tp = kid(s, 'text-properties');
      const b = att(tp, 'font-weight') === 'bold' || Number(att(tp, 'font-weight')) >= 600;
      const i = att(tp, 'font-style') === 'italic' || att(tp, 'font-style') === 'oblique';
      if (b || i) looks.set(att(s, 'name') ?? '', { b, i });
    }
    for (const l of all(root, 'list-style')) {
      const lv = new Map<number, { fmt: string; suffix: string } | null>();
      for (const x of kids(l)) {
        const level = Number(att(x, 'level') ?? 1) - 1;
        if (x.n === 'list-level-style-number') {
          const f = att(x, 'num-format') ?? '1';
          lv.set(level, { fmt: f === 'a' ? 'lowerLetter' : f === 'A' ? 'upperLetter' : f === 'i' ? 'lowerRoman' : f === 'I' ? 'upperRoman' : f ? 'decimal' : 'none', suffix: att(x, 'num-suffix') ?? '.' });
        } else lv.set(level, null);
      }
      lists.set(att(l, 'name') ?? '', lv);
    }
  }
  return { looks, lists };
}

function inline(el: El, ctx: Ctx, f: Fmt, sp: Spans, after: Block[]) {
  for (const x of el.c) {
    if (typeof x === 'string') {
      sp.add(x.replace(/[ \t\r\n]+/g, ' '), f);
      continue;
    }
    switch (x.n) {
      case 'span': {
        const look = ctx.looks.get(att(x, 'style-name') ?? '');
        inline(x, ctx, { ...f, b: f.b || look?.b, i: f.i || look?.i }, sp, after);
        break;
      }
      case 'a':
        inline(x, ctx, { ...f, href: safeHref(att(x, 'href')) ?? f.href }, sp, after);
        break;
      case 's':
        sp.add(' '.repeat(Math.min(Number(att(x, 'c') ?? 1) || 1, 100)), f);
        break;
      case 'tab':
        sp.add('\t', f);
        break;
      case 'line-break':
        sp.add('\n', f);
        break;
      case 'note': {
        const mark = textOf(kid(x, 'note-citation')).trim() || String(ctx.footnotes.length + 1);
        sp.add(`[^${mark}]`, f);
        const inner: Block[] = [];
        flow(kid(x, 'note-body'), ctx, inner);
        const t = inner.map(blockPlain).join(' ').trim();
        if (t) ctx.footnotes.push({ k: 'p', s: [{ t: `[^${mark}]: ${t}` }] });
        break;
      }
      case 'frame': {
        const box = kid(x, 'text-box');
        if (box && ctx.depth < 6) {
          ctx.depth++;
          flow(box, ctx, after);
          ctx.depth--;
        } else if (kid(x, 'image') || kid(x, 'object') || kid(x, 'object-ole')) {
          const alt = (textOf(kid(x, 'title')) || textOf(kid(x, 'desc')) || '').trim();
          after.push({ k: 'img', ...(alt ? { alt } : {}) });
        }
        break;
      }
      case 'annotation':
      case 'annotation-end':
      case 'bookmark':
      case 'bookmark-start':
      case 'bookmark-end':
      case 'soft-page-break':
      case 'tracked-changes':
        break;
      default:
        // Fields (page numbers, dates, titles…) and other inline wrappers: their text.
        inline(x, ctx, f, sp, after);
    }
  }
}

function para(x: El, ctx: Ctx, out: Block[], as?: { level: number; n?: string }) {
  const sp = new Spans(ctx.budget);
  const after: Block[] = [];
  const look = ctx.looks.get(att(x, 'style-name') ?? '');
  inline(x, ctx, { b: look?.b, i: look?.i }, sp, after);
  const s = sp.done();
  if (s.length) {
    if (x.n === 'h') out.push({ k: 'h', level: Math.min(Number(att(x, 'outline-level') ?? 1) || 1, 6), s });
    else if (as) out.push({ k: 'li', level: as.level, ...(as.n ? { n: as.n } : {}), s });
    else out.push({ k: 'p', s });
  }
  out.push(...after);
}

function list(x: El, ctx: Ctx, out: Block[], level: number, style: string | undefined) {
  const st = att(x, 'style-name') ?? style;
  const lv = ctx.lists.get(st ?? '')?.get(level);
  let n = Number(att(x, 'start-value') ?? 1) - 1;
  for (const item of kids(x)) {
    if (item.n !== 'list-item' && item.n !== 'list-header') continue;
    if (att(item, 'start-value')) n = Number(att(item, 'start-value')) - 1;
    const label = lv && lv.fmt !== 'none' && item.n === 'list-item' ? `${numberAs(++n, lv.fmt)}${lv.suffix}` : undefined;
    let first = true;
    for (const c of kids(item)) {
      if (c.n === 'list') list(c, ctx, out, Math.min(level + 1, 8), st);
      else if (c.n === 'p' || c.n === 'h') {
        para(c, ctx, out, { level, n: first ? label : undefined });
        first = false;
      } else flow({ n: '#', a: {}, c: [c] }, ctx, out);
    }
  }
}

function table(x: El, ctx: Ctx): Block {
  const rows: string[][] = [];
  const rowsOf = (el: El): El[] => kids(el).flatMap((r) => (r.n === 'table-row' ? [r] : ['table-header-rows', 'table-rows', 'table-row-group'].includes(r.n) ? rowsOf(r) : []));
  for (const r of rowsOf(x).slice(0, 5000)) {
    const row: string[] = [];
    for (const c of kids(r)) {
      if (c.n !== 'table-cell' && c.n !== 'covered-table-cell') continue;
      const inner: Block[] = [];
      if (ctx.depth < 6) {
        ctx.depth++;
        flow(c, ctx, inner);
        ctx.depth--;
      }
      const t = inner.map(blockPlain).join('\n');
      const rep = Math.min(Number(att(c, 'number-columns-repeated') ?? 1) || 1, t ? 64 : 1);
      for (let k = 0; k < rep; k++) row.push(t);
    }
    while (row.length && !row[row.length - 1]) row.pop();
    rows.push(row);
  }
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return { k: 'table', rows };
}

/** Block content: headings, paragraphs, lists, tables, sections. */
function flow(el: El | undefined, ctx: Ctx, out: Block[]) {
  if (!el) return;
  for (const x of el.c) {
    if (!isEl(x) || ctx.budget.cut) continue;
    switch (x.n) {
      case 'h':
      case 'p':
        para(x, ctx, out);
        break;
      case 'list':
        list(x, ctx, out, 0, undefined);
        break;
      case 'table':
        out.push(table(x, ctx));
        break;
      case 'section':
      case 'index-body':
      case 'custom-shape':
      case 'g':
        if (ctx.depth < 8) {
          ctx.depth++;
          flow(x, ctx, out);
          ctx.depth--;
        }
        break;
      case 'frame':
        // A frame's text box or picture, as blocks of their own.
        inline({ n: '#', a: {}, c: [x] }, ctx, {}, new Spans(), out);
        break;
    }
  }
}

function meta(zip: Zip): string | undefined {
  const xml = zip.text('meta.xml');
  const t = xml ? textOf(all(parseXml(xml).root, 'title')[0]).trim() : '';
  return t || undefined;
}

function sheet(t: El, lim: SheetLimits, budget: Budget): DocPart {
  const rows: { n: number; c: string[] }[] = [];
  const formulas: [string, string][] = [];
  let rowN = 0;
  let maxCol = -1;
  let more = false;
  const rowsOf = (el: El): El[] => kids(el).flatMap((r) => (r.n === 'table-row' ? [r] : ['table-header-rows', 'table-rows', 'table-row-group'].includes(r.n) ? rowsOf(r) : []));
  for (const r of rowsOf(t)) {
    const repeat = Number(att(r, 'number-rows-repeated') ?? 1) || 1;
    const cells: string[] = [];
    let col = 0;
    for (const c of kids(r)) {
      if (c.n !== 'table-cell' && c.n !== 'covered-table-cell') continue;
      const ps = kids(c, 'p');
      let v = ps.length ? ps.map((p) => textOf(p)).join('\n') : (att(c, 'value') ?? att(c, 'date-value') ?? att(c, 'string-value') ?? '');
      v = v.trim();
      const f = att(c, 'formula');
      const rep = Number(att(c, 'number-columns-repeated') ?? 1) || 1;
      if (f && formulas.length < 40) formulas.push([`${colName(col)}${rowN + 1}`, f.replace(/^of:/, '')]);
      if (!v) {
        col += rep;
        continue;
      }
      for (let k = 0; k < Math.min(rep, 64); k++, col++) {
        if (col < lim.cols) {
          cells[col] = v;
          budget.take(v.length + 3);
        }
        maxCol = Math.max(maxCol, col);
      }
      if (rep > 64) col += rep - 64;
    }
    const has = cells.some(Boolean);
    for (let k = 0; k < (has ? Math.min(repeat, lim.rows) : 1); k++) {
      if (has) {
        if (rows.length >= lim.rows || budget.cut) {
          more = true;
          break;
        }
        rows.push({ n: rowN + k + 1, c: Array.from({ length: cells.length }, (_, i) => cells[i] ?? '') });
      }
    }
    if (more) break;
    rowN += repeat;
  }
  const width = Math.min(maxCol + 1, lim.cols);
  for (const r of rows) r.c = Array.from({ length: width }, (_, i) => r.c[i] ?? '');
  return {
    kind: 'sheet',
    title: att(t, 'name'),
    blocks: [],
    cells: { col: 0, rows, totalRows: rows.length, totalCols: maxCol + 1, ...(more ? { more } : {}), ...(formulas.length ? { formulas } : {}) },
  };
}

export function readOdf(zip: Zip, budget: Budget, lim: SheetLimits): DocModel {
  const xml = zip.text('content.xml');
  if (!xml) throw new Error('This OpenDocument file has no content in it');
  const { root, cut } = parseXml(xml);
  const st = zip.text('styles.xml');
  const ctx: Ctx = { ...styles([root, ...(st ? [parseXml(st).root] : [])]), budget, footnotes: [], depth: 0 };
  const body = kid(root, 'body');
  const notes: string[] = cut ? ['The document is very large: only its first part was read.'] : [];
  const text = kid(body, 'text');
  const calc = kid(body, 'spreadsheet');
  const show = kid(body, 'presentation') ?? kid(body, 'drawing');
  const parts: DocPart[] = [];
  let format = 'odt';
  if (calc) {
    format = 'ods';
    for (const t of kids(calc, 'table')) {
      if (budget.cut) {
        notes.push(`Sheet “${att(t, 'name')}” and those after it were left out: the workbook has more text than this reads at once.`);
        break;
      }
      const p = sheet(t, lim, budget);
      if (p.cells?.more) notes.push(`Sheet “${p.title}” shows its first ${p.cells.rows.length} rows; it has more.`);
      parts.push(p);
    }
  } else if (show) {
    format = 'odp';
    for (const page of kids(show, 'page')) {
      if (budget.cut) {
        notes.push(`Slides after ${parts.length} were left out: the presentation has more text than this reads at once.`);
        break;
      }
      let title: string | undefined;
      const blocks: Block[] = [];
      const frames = (el: El) => {
        for (const f of kids(el)) {
          if (f.n === 'g') frames(f);
          if (f.n !== 'frame' && f.n !== 'custom-shape') continue;
          const cls = att(f, 'class');
          if (cls === 'page-number' || cls === 'footer' || cls === 'date-time' || cls === 'header') continue;
          const inner: Block[] = [];
          flow(kid(f, 'text-box') ?? f, ctx, inner);
          if (kid(f, 'image') && !inner.length) {
            const alt = (textOf(kid(f, 'title')) || textOf(kid(f, 'desc')) || '').trim();
            inner.push({ k: 'img', ...(alt ? { alt } : {}) });
          }
          if (cls === 'title' && !title) title = inner.map(blockPlain).join('\n').trim() || undefined;
          else if (cls === 'outline') blocks.push(...inner.map((b): Block => (b.k === 'p' ? { k: 'li', level: 0, s: b.s } : b)));
          else blocks.push(...inner);
        }
      };
      frames(page);
      const said: Block[] = [];
      const n = kid(page, 'notes');
      if (n) for (const f of kids(n, 'frame')) if (att(f, 'class') === 'notes') flow(kid(f, 'text-box') ?? f, ctx, said);
      parts.push({ kind: 'slide', title: title ?? (att(page, 'name') && !/^page\d+$/i.test(att(page, 'name')!) ? att(page, 'name') : undefined), blocks, ...(said.length ? { notes: said } : {}) });
    }
  } else {
    const blocks: Block[] = [];
    // The tracked changes' deleted text and the table of contents' copy of the headings stay out.
    flow(
      text ? { ...text, c: text.c.filter((x) => !isEl(x) || !['tracked-changes', 'table-of-content', 'sequence-decls', 'variable-decls', 'user-field-decls', 'forms'].includes(x.n)) } : undefined,
      ctx,
      blocks,
    );
    parts.push({ kind: 'body', blocks });
    if (ctx.footnotes.length) parts.push({ kind: 'extra', title: 'Footnotes', blocks: ctx.footnotes });
  }
  return { format, title: meta(zip), parts, notes };
}
