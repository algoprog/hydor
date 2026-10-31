// EPUB books: a zip with a package file (the reading order) and XHTML chapters. Each chapter's
// headings, paragraphs, lists, tables, quotes and preformatted text, in the order the book is read.
import type { Block, DocModel, DocPart } from '../../shared/documents.ts';
import { all, att, kid, kids, parseXml, textOf, type El } from './xml.ts';
import { resolvePart, type Zip } from './zip.ts';
import { blockPlain, Budget, Spans, type Fmt } from './model.ts';

const SKIP = new Set(['head', 'script', 'style', 'noscript', 'template', 'svg', 'math', 'button', 'input', 'select', 'textarea', 'iframe', 'object']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'figure', 'figcaption', 'blockquote', 'ul', 'ol', 'li', 'table', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'dl', 'dt', 'dd', 'address', 'body', 'center', 'details', 'summary']);

const safeHref = (u: string | undefined) => (u && /^(https?:|mailto:)/i.test(u.trim()) ? u.trim() : undefined);

/** HTML (as XML) to blocks: inline content gathers into paragraphs, block elements break them. */
export function htmlBlocks(root: El, budget: Budget): Block[] {
  const out: Block[] = [];
  let sp = new Spans(budget);
  const flush = () => {
    const s = sp.done(true);
    if (s.length) out.push({ k: 'p', s });
    sp = new Spans(budget);
  };
  const inline = (el: El, f: Fmt) => {
    for (const x of el.c) {
      if (typeof x === 'string') {
        sp.add(x, f);
        continue;
      }
      const n = x.n.toLowerCase();
      if (SKIP.has(n)) continue;
      if (BLOCK.has(n)) {
        flush();
        block(x, 0);
        continue;
      }
      if (n === 'br') sp.add('\n', f);
      else if (n === 'img') {
        flush();
        const alt = (att(x, 'alt') ?? '').trim();
        out.push({ k: 'img', ...(alt ? { alt } : {}) });
      } else if (n === 'a') inline(x, { ...f, href: safeHref(att(x, 'href')) ?? f.href });
      else if (n === 'strong' || n === 'b') inline(x, { ...f, b: true });
      else if (n === 'em' || n === 'i' || n === 'cite') inline(x, { ...f, i: true });
      else inline(x, f);
    }
  };
  const list = (el: El, level: number) => {
    const ordered = el.n.toLowerCase() === 'ol';
    let n = Number(att(el, 'start') ?? 1) - 1;
    for (const li of kids(el)) {
      if (li.n.toLowerCase() !== 'li' || budget.cut) continue;
      n++;
      const inner = new Spans(budget);
      const nested: El[] = [];
      const gather = (x: El, f: Fmt) => {
        for (const c of x.c) {
          if (typeof c === 'string') inner.add(c, f);
          else {
            const cn = c.n.toLowerCase();
            if (SKIP.has(cn)) continue;
            if (cn === 'ul' || cn === 'ol') nested.push(c);
            else if (cn === 'br') inner.add('\n', f);
            else if (cn === 'a') gather(c, { ...f, href: safeHref(att(c, 'href')) ?? f.href });
            else if (cn === 'strong' || cn === 'b') gather(c, { ...f, b: true });
            else if (cn === 'em' || cn === 'i') gather(c, { ...f, i: true });
            else {
              if (BLOCK.has(cn)) inner.add(' ', f);
              gather(c, f);
            }
          }
        }
      };
      gather(li, {});
      const s = inner.done(true);
      if (s.length) out.push({ k: 'li', level, ...(ordered ? { n: `${n}.` } : {}), s });
      for (const sub of nested) list(sub, Math.min(level + 1, 8));
    }
  };
  const block = (el: El, depth: number) => {
    if (depth > 40 || budget.cut) return;
    const n = el.n.toLowerCase();
    const h = /^h([1-6])$/.exec(n);
    if (h) {
      const s = new Spans(budget);
      s.add(textOf(el));
      const t = s.done(true);
      if (t.length) out.push({ k: 'h', level: Number(h[1]), s: t });
      return;
    }
    if (n === 'ul' || n === 'ol') return list(el, 0);
    if (n === 'pre') {
      const text = textOf(el);
      budget.take(text.length);
      if (text.trim()) out.push({ k: 'pre', text });
      return;
    }
    if (n === 'table') {
      const rows: string[][] = [];
      for (const tr of all(el, 'tr')) {
        const row = kids(tr)
          .filter((c) => c.n === 'td' || c.n === 'th')
          .map((c) => {
            const inner = htmlBlocks(c, budget);
            return inner.map(blockPlain).join('\n');
          });
        rows.push(row);
      }
      if (rows.length) out.push({ k: 'table', rows });
      return;
    }
    if (n === 'hr') return;
    inline(el, {});
    flush();
  };
  block(root, 0);
  flush();
  return out;
}

export function readEpub(zip: Zip, budget: Budget): DocModel {
  const container = zip.text('META-INF/container.xml');
  const opfPath = container ? att(all(parseXml(container).root, 'rootfile')[0], 'full-path') : zip.names().find((n) => n.endsWith('.opf'));
  const opfXml = opfPath ? zip.text(opfPath) : null;
  if (!opfPath || !opfXml) throw new Error('This EPUB has no package file');
  const opf = parseXml(opfXml).root;
  const title = textOf(all(kid(opf, 'metadata'), 'title')[0]).trim() || undefined;
  const items = new Map<string, string>();
  for (const it of all(kid(opf, 'manifest'), 'item')) items.set(att(it, 'id') ?? '', resolvePart(opfPath, att(it, 'href') ?? ''));
  const parts: DocPart[] = [];
  const notes: string[] = [];
  for (const ref of all(kid(opf, 'spine'), 'itemref')) {
    if (budget.cut) {
      notes.push(`The book was read up to chapter ${parts.length}: it has more text than this reads at once.`);
      break;
    }
    const file = items.get(att(ref, 'idref') ?? '');
    const xml = file ? zip.text(file) : null;
    if (!xml) continue;
    const doc = parseXml(xml).root;
    const body = all(doc, 'body')[0] ?? doc;
    const blocks = htmlBlocks(body, budget);
    if (!blocks.length) continue;
    const first = blocks.find((b) => b.k === 'h');
    parts.push({ kind: 'chapter', title: first && first.k === 'h' ? first.s.map((s) => s.t).join('') : undefined, blocks });
  }
  return { format: 'epub', title, parts, notes };
}
