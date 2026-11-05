// Agents' tools for PDFs, on each session's own MCP server: see a PDF's pages (pictures with its fields marked and a
// ruler, and its words with where they are), list its form, fill it, write on its pages, and change its pages. What a
// tool changes is saved as a copy beside the file ("name (filled).pdf") unless the agent asks to replace it, when the
// old version goes to the Trash first, as Files' own saves do.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../../config.ts';
import type { RunTool, ToolOutput } from '../../features/types.ts';
import { freeName, trashCopy, writeFile } from '../../files.ts';
import type { Mark } from './draw.ts';
import { PageEdits } from './edits.ts';
import { pageList, type PageOp } from './edit.ts';
import { PdfFile } from './file.ts';
import { FontBox, fontsFor } from './fontset.ts';
import type { Field } from './forms.ts';
import { editPages, extractPages, fillPdf, pdfInfo, splitPdf, writeOnPdf } from './index.ts';
import { num } from './objects.ts';
import { pages } from './pages.ts';
import { renderPage } from './render.ts';
import { pageLines } from './text.ts';

/** Most a PDF given to these tools may weigh. */
const MAX_BYTES = 200 * 1024 * 1024;

/** A path an agent gave: from the session's folder, or absolute, or from home (~). */
function fromSession(cwd: string, p: unknown): string {
  const s = String(p ?? '').trim();
  if (!s) throw new Error('path: the PDF, in the session’s folder (relative paths start there) or absolute.');
  if (s === '~' || s.startsWith('~/')) return path.join(os.homedir(), s.slice(1));
  return path.resolve(cwd || config.defaultCwd, s);
}

function readPdf(file: string): Buffer {
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st) throw new Error(`No such file: ${file}`);
  if (st.isDirectory()) throw new Error(`${file} is a folder.`);
  if (st.size > MAX_BYTES) throw new Error(`${path.basename(file)} is over ${MAX_BYTES / 1024 / 1024} MB.`);
  const b = fs.readFileSync(file);
  if (!b.subarray(0, 1024).includes('%PDF-')) throw new Error(`${path.basename(file)} is not a PDF.`);
  return b;
}

const SAVE_PROPS = {
  save_as: { type: 'string', description: 'Where to write the result (a .pdf path, from the session’s folder or absolute). Default: a copy beside the file, "name (filled).pdf".' },
  replace: { type: 'boolean', description: 'Write over the file itself (its old version goes to the Trash first). Only when the user asked for the file itself to change.' },
};

/** Writes the result: over the file (its old version to the Trash), where asked, or beside it under a free name. */
async function save(src: string, data: Buffer, a: Record<string, unknown>, suffix: string, cwd: string): Promise<string> {
  if (a.replace === true) {
    const was = await trashCopy(src);
    await writeFile(src, data, {});
    return `${src} (replaced; its old version is in the Trash: ${path.basename(was)})`;
  }
  let dest: string;
  if (typeof a.save_as === 'string' && a.save_as.trim()) {
    dest = fromSession(cwd, a.save_as);
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) dest = freeName(dest, `${path.basename(src, path.extname(src))} (${suffix}).pdf`);
    else if (!/\.pdf$/i.test(dest)) dest += '.pdf';
    if (path.resolve(dest) === path.resolve(src)) throw new Error('save_as is the file itself: pass replace: true to write over it.');
    if (fs.existsSync(dest)) throw new Error(`${dest} already exists: give save_as another name.`);
  } else dest = freeName(path.dirname(src), `${path.basename(src, path.extname(src))} (${suffix}).pdf`);
  await writeFile(dest, data, { create: true });
  return dest;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A field in one line: its number, name, kind, value, choices, words beside it, place. */
function fieldLine(f: Field, i: number): string {
  const v = f.value === null ? '' : Array.isArray(f.value) ? JSON.stringify(f.value) : typeof f.value === 'boolean' ? String(f.value) : JSON.stringify(f.value);
  const opts = f.options?.length ? ` choices: ${f.options.map((o) => (o.label && o.label !== o.value ? `"${o.value}" (${o.label})` : `"${o.value}"`)).join(', ')}` : '';
  const flags = [
    f.readOnly && 'read-only',
    f.required && 'required',
    f.maxLength && `at most ${f.maxLength} characters`,
    f.comb && 'one character a box',
    f.multiSelect && 'several choices',
    f.editable && 'own words allowed',
    f.signed && 'signed',
    f.locked && 'locked by a signature',
  ]
    .filter(Boolean)
    .join(', ');
  const where = f.widgets
    .filter((w) => w.page)
    .map((w) => `p${w.page} x ${r1(w.x)} y ${r1(w.y)} ${r1(w.w)}×${r1(w.h)}`)
    .slice(0, 4)
    .join('; ');
  return `#${i + 1} "${f.name}" ${f.kind}${v ? ` = ${v}` : ''}${opts}${f.label ? ` · label "${f.label}"` : ''}${f.tooltip && f.tooltip !== f.label ? ` · tooltip "${f.tooltip}"` : ''}${flags ? ` · ${flags}` : ''}${where ? ` · ${where}` : ''}`;
}

function aboutFile(info: ReturnType<typeof pdfInfo>): string[] {
  const out: string[] = [];
  if (info.encrypted)
    out.push(
      `Encrypted with an empty user password (it opens without one)${info.permissions && !info.permissions.modify ? '; its owner does not allow changing its pages' : ''}${info.permissions && !info.permissions.fillForms ? '; nor filling its form' : ''}.`,
    );
  if (info.certified) out.push(`Certified with a digital signature that allows ${info.certified === 1 ? 'no changes' : info.certified === 2 ? 'filling its form only' : 'filling its form and comments only'}.`);
  else if (info.signed) out.push('It has a digital signature: filling its form keeps it valid; writing on its pages shows as a change after signing; page operations drop it.');
  if (info.form.dynamic) out.push('It is an XFA form (Adobe LiveCycle): its fields can only be filled in Adobe Acrobat or Reader. Write on its pages instead if it must be filled here.');
  else if (info.form.xfa) out.push('It also has an XFA form: filling here takes that out, so every viewer shows the fields as filled.');
  if (info.repaired) out.push('Its cross-references were damaged and were rebuilt (what is saved is whole again).');
  return out;
}

/** A page's picture for an agent: its fields outlined and numbered, a ruler every 50 points on its edges. */
async function lookPicture(pdf: Buffer, page: number, fields: Field[], width: number): Promise<Buffer> {
  const f = new PdfFile(pdf);
  const p = pages(f)[page - 1];
  const edits = new PageEdits(f);
  const e = edits.page(p);
  const fonts = new FontBox(f, await fontsFor('0123456789#'));
  const H = p.height;
  const label = (s: string, x: number, y: number, size: number, rgb: string) =>
    `BT ${rgb} rg ${fonts
      .runs(s)
      .map((r) => `/${e.resource('Font', r.font.ref, r.res)} ${size} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm <${r.bytes.toString('hex')}> Tj`)
      .join(' ')} ET`;
  // Ruler: ticks on the top and left edges every 50 points, numbered every 100.
  const ops = ['q 0.85 0.3 0.1 RG 0.6 w'];
  for (let x = 50; x < p.width; x += 50) ops.push(`${num(x)} ${num(H)} m ${num(x)} ${num(H - (x % 100 ? 5 : 9))} l S`);
  for (let y = 50; y < H; y += 50) ops.push(`0 ${num(H - y)} m ${num(y % 100 ? 5 : 9)} ${num(H - y)} l S`);
  ops.push('Q');
  for (let x = 100; x < p.width; x += 100) ops.push(label(String(x), x + 1.5, H - 9, 6, '0.85 0.3 0.1'));
  for (let y = 100; y < H; y += 100) ops.push(label(String(y), 10, H - y - 2.2, 6, '0.85 0.3 0.1'));
  // Fields: outlined, numbered as pdf_form lists them.
  fields.forEach((fd, i) => {
    for (const w of fd.widgets) {
      if (w.page !== page || !w.w) continue;
      ops.push(`q 0.1 0.45 0.95 RG 1 w ${num(w.x)} ${num(H - w.y - w.h)} ${num(w.w)} ${num(w.h)} re S Q`);
      ops.push(`q 0.1 0.45 0.95 rg ${num(w.x)} ${num(H - w.y)} ${num(4 + String(i + 1).length * 4)} 7 re f Q`);
      ops.push(label(String(i + 1), w.x + 1.5, H - w.y + 1.3, 6, '1 1 1'));
    }
  });
  e.ops.push(...ops);
  edits.finish();
  fonts.finish();
  return renderPage(f.saveUpdate(), page, { width });
}

const LOOK: RunTool = {
  name: 'pdf_look',
  annotations: { readOnlyHint: true },
  description: [
    'See a PDF’s pages as pictures, with what you need to fill or mark it: its form fields outlined and numbered (as pdf_form lists them), a ruler in points on the top and left edges,',
    'and the words on each page with where they are (x, y from the page’s top-left, in points; width and height). Use it before writing on a page, to find where blanks, lines and boxes are,',
    'and after filling or writing, to check the result. At most 4 pages a call. Places are in points from the page’s top-left corner as it shows (72 points to an inch).',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The PDF: in the session’s folder (relative paths start there) or absolute.' },
      pages: { type: 'string', description: 'Which pages: "1", "2-3", "1,4" (default 1).' },
      width: { type: 'integer', description: 'The pictures’ width in pixels (default 1000; 600 to 1600).' },
      words: { type: 'boolean', description: 'List the words on the pages with where they are (default true).' },
    },
    required: ['path'],
  },
  async run(a, ctx): Promise<ToolOutput> {
    const file = fromSession(ctx.cwd, a.path);
    const pdf = readPdf(file);
    const info = pdfInfo(pdf);
    const list = pageList(String(a.pages ?? '1'), info.pages.length);
    if (list.length > 4) throw new Error('At most 4 pages a call: ask for the others in another call.');
    const width = Math.max(600, Math.min(1600, Math.round(Number(a.width) || 1000)));
    const f = new PdfFile(pdf);
    const all = pages(f);
    const out: string[] = [
      `${path.basename(file)} · ${info.pages.length} page${info.pages.length === 1 ? '' : 's'}${info.form.fields.length ? ` · a form of ${info.form.fields.length} field${info.form.fields.length === 1 ? '' : 's'}` : ' · no form fields'}`,
      ...aboutFile(info),
    ];
    const images: ToolOutput['images'] = [];
    for (const n of list) {
      const p = info.pages[n - 1];
      out.push('', `Page ${n}: ${r1(p.width)} × ${r1(p.height)} points${p.rotate ? ` (turned ${p.rotate}°)` : ''}. Picture ${images.length + 1}: ${width} pixels wide, so 1 point = ${r1(width / p.width)} pixels.`);
      const here = info.form.fields.map((fd, i) => ({ fd, i })).filter(({ fd }) => fd.widgets.some((w) => w.page === n));
      if (here.length) out.push(`Fields on it (outlined in blue, numbered):`, ...here.map(({ fd, i }) => fieldLine(fd, i)));
      if (a.words !== false) {
        const ls = pageLines(f, all[n - 1]);
        if (!ls.length) out.push('No words on this page: it is probably scanned. Place marks by looking at the picture and its ruler.');
        else {
          out.push('Words (x, y, width × height):');
          for (const l of ls.slice(0, 200)) out.push(`  ${r1(l.x)}, ${r1(l.y)} ${r1(l.w)}×${r1(l.h)}  ${l.text}`);
          if (ls.length > 200) out.push(`  … ${ls.length - 200} more lines (read_document reads all the text).`);
        }
      }
      images.push({ data: (await lookPicture(pdf, n, info.form.fields, width)).toString('base64'), mimeType: 'image/png' });
    }
    return { text: out.join('\n'), images };
  },
};

const FORM: RunTool = {
  name: 'pdf_form',
  annotations: { readOnlyHint: true },
  description: [
    'List a PDF’s form fields: each one’s name, kind (text, multiline, checkbox, radio, dropdown, list, signature, button), its value now, its choices, the words printed beside it',
    '(which say what a field named "f1_02[0]" is for), whether it is required or read-only, and where it is. To fill a form, start to end:',
    '1. pdf_form to see its fields (pdf_look shows them on the page, numbered); a PDF with no fields is a form only printed: use pdf_look to find its blanks and pdf_write to write on them.',
    '2. Ask the user for whatever you do not know, all at once (ask_form suits several answers); never make up personal details.',
    '3. pdf_fill with the values by field name. 4. pdf_look at the result. 5. present_files with the filled copy.',
    'A signature field takes a signature placed as a picture, not typed.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'The PDF: in the session’s folder (relative paths start there) or absolute.' } },
    required: ['path'],
  },
  async run(a, ctx) {
    const file = fromSession(ctx.cwd, a.path);
    const info = pdfInfo(readPdf(file));
    const head = [`${path.basename(file)} · ${info.pages.length} page${info.pages.length === 1 ? '' : 's'}`, ...aboutFile(info)];
    if (!info.form.fields.length)
      return [...head, info.form.dynamic ? '' : 'No form fields: the form, if it is one, is only printed lines and boxes. Use pdf_look to see where its blanks are, and pdf_write to write on them (text beside the words printed, ticks in boxes).']
        .filter(Boolean)
        .join('\n');
    return [...head, `${info.form.fields.length} field${info.form.fields.length === 1 ? '' : 's'} (places: page, x and y of the box's top-left from the page's top-left, width × height, in points):`, ...info.form.fields.map(fieldLine)].join('\n');
  },
};

const FILL: RunTool = {
  name: 'pdf_fill',
  description: [
    'Fill a PDF’s form fields by name (as pdf_form lists them; a field’s label or tooltip works too when only one field has it). Values: text for text fields (multiline ones take line breaks),',
    'true or false for a checkbox, one of the choices for radio buttons and dropdowns, a list of choices for a list. Each value is drawn into its field so every viewer shows it (any script: Greek, Chinese…).',
    'Nothing is filled if a value does not fit its field: the error says why for each. flatten: true paints the values into the page and takes the form away (no longer editable).',
    'The result is a copy beside the file ("name (filled).pdf") unless save_as or replace says otherwise; a digital signature already in the file stays valid. Then look at it with pdf_look.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The PDF: in the session’s folder (relative paths start there) or absolute.' },
      values: { type: 'object', description: 'Field name → value: { "first_name": "Ana", "agree": true, "shift": "Evening", "skills": ["Cooking", "Driving"] }.', additionalProperties: true },
      flatten: { type: 'boolean', description: 'Paint the fields into the pages and take the form away.' },
      ...SAVE_PROPS,
    },
    required: ['path', 'values'],
  },
  async run(a, ctx) {
    const file = fromSession(ctx.cwd, a.path);
    if (!a.values || typeof a.values !== 'object' || Array.isArray(a.values) || !Object.keys(a.values).length) throw new Error('values: an object of field names and values, such as { "first_name": "Ana" }.');
    const r = await fillPdf(readPdf(file), a.values, { flatten: a.flatten === true });
    const where = await save(file, r.data, a, 'filled', ctx.cwd);
    return [`Filled ${r.filled.length} field${r.filled.length === 1 ? '' : 's'} (${r.filled.join(', ')}) and saved ${where}.`, ...r.notes, 'Look at it with pdf_look, then hand it over with present_files.'].join('\n');
  },
};

const MARK_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['text', 'check', 'cross', 'dot', 'image', 'whiteout', 'rect', 'line', 'highlight', 'comment'] },
    page: { type: 'integer', description: 'The page, from 1.' },
    x: { type: 'number', description: 'Points from the page’s left edge (as pdf_look shows it).' },
    y: { type: 'number', description: 'Points from the page’s top edge: the top of the mark’s box.' },
    near: {
      type: 'object',
      description: 'Instead of x and y: beside words printed on the page, lined up with them.',
      properties: {
        words: { type: 'string', description: 'Words on the page, such as "Signature:" (case and accents do not matter).' },
        side: { type: 'string', enum: ['right', 'left', 'below', 'above', 'over'], description: 'right (the default: after them on their line), left, below, above, or over them (whiteout, highlight).' },
        gap: { type: 'number', description: 'Points between them and the mark (default 4).' },
        nth: { type: 'integer', description: 'Which time they appear on the page, from 1.' },
      },
      required: ['words'],
    },
    text: { type: 'string', description: 'text: the words (line breaks start new lines); comment: the comment.' },
    size: { type: 'number', description: 'text: font size in points (default 11); check, cross, dot: their size (default 12).' },
    color: { type: 'string', description: '#rrggbb or black, blue, red, green, gray, yellow, white.' },
    width: { type: 'number', description: 'text: wrap the words at this width, in points.' },
    align: { type: 'string', enum: ['left', 'center', 'right'] },
    image: { type: 'string', description: 'image: a PNG or JPEG file (its transparency is kept).' },
    w: { type: 'number', description: 'image, whiteout, rect, highlight: width in points (an image keeps its shape).' },
    h: { type: 'number', description: 'image, whiteout, rect, highlight: height in points.' },
    x1: { type: 'number' },
    y1: { type: 'number' },
    x2: { type: 'number' },
    y2: { type: 'number' },
    lineWidth: { type: 'number', description: 'line, rect: in points (default 1).' },
    author: { type: 'string', description: 'comment: who wrote it.' },
  },
  required: ['type', 'page'],
};

const WRITE: RunTool = {
  name: 'pdf_write',
  description: [
    'Write on a PDF’s pages: text (any script: Greek, Chinese…), ticks (check), crosses, dots, pictures (image: a PNG or JPEG file), white boxes over what is there (whiteout), outlines (rect), lines,',
    'highlights over words, and comments (sticky notes). Use it for forms that are only printed (lines and boxes, no fields; scanned ones too) and for notes and corrections.',
    'Place each mark at x, y (points from the page’s top-left, as pdf_look’s ruler and words show) or near: { words } printed on the page (after them on their line by default, on their baseline):',
    '{ "type": "text", "page": 1, "near": { "words": "Date of birth:" }, "text": "12/03/1990" }. Check the result with pdf_look.',
    'A white box hides from the eye only: the words under it stay in the file (this is no redaction). A signature is placed with the signature tool, not as a picture from a file the user did not give you.',
    'The result is a copy beside the file ("name (filled).pdf") unless save_as or replace says otherwise.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The PDF: in the session’s folder (relative paths start there) or absolute.' },
      marks: { type: 'array', minItems: 1, maxItems: 300, items: MARK_SCHEMA },
      ...SAVE_PROPS,
    },
    required: ['path', 'marks'],
  },
  async run(a, ctx) {
    const file = fromSession(ctx.cwd, a.path);
    if (!Array.isArray(a.marks) || !a.marks.length) throw new Error('marks: a list of what to write, such as [{ "type": "text", "page": 1, "x": 72, "y": 140, "text": "Ana Costa" }].');
    const marks: Mark[] = a.marks.map((m: Record<string, unknown>, i: number) => {
      if (!m || typeof m !== 'object') throw new Error(`marks[${i}] is not a mark.`);
      if (m.type === 'image') {
        if (typeof m.image !== 'string' || !m.image.trim()) throw new Error(`marks[${i}]: an image needs image, the path of a PNG or JPEG file.`);
        const pic = fromSession(ctx.cwd, m.image);
        if (!fs.existsSync(pic)) throw new Error(`marks[${i}]: no such picture: ${pic}`);
        return { ...m, data: fs.readFileSync(pic) } as Mark;
      }
      return m as unknown as Mark;
    });
    const r = await writeOnPdf(readPdf(file), marks);
    const where = await save(file, r.data, a, 'filled', ctx.cwd);
    const placed = r.placed.map((p, i) => `${i + 1}. ${p.type} on page ${p.page} at x ${r1(p.x)}, y ${r1(p.y)} (${r1(p.w)} × ${r1(p.h)})`);
    return [`Wrote ${r.placed.length} mark${r.placed.length === 1 ? '' : 's'} and saved ${where}:`, ...placed, ...r.notes, 'Look at the pages with pdf_look to check where they went.'].join('\n');
  },
};

const PAGES: RunTool = {
  name: 'pdf_pages',
  description: [
    'Change a PDF’s pages: rotate, delete, move, put in blank pages, merge other PDFs in (ops, applied in order, each page number as the pages are at that step);',
    'or take some pages out into a file of their own (extract), or split the file (split). Pages keep their form fields, links and comments.',
    'Saved as a whole new file: a digital signature already in it is dropped (the note says so). The result is a copy beside the file ("name (edited).pdf") unless save_as or replace says otherwise.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The PDF: in the session’s folder (relative paths start there) or absolute.' },
      ops: {
        type: 'array',
        description:
          'In order: { "op": "rotate", "pages": "2-3", "angle": 90 } (90, 180, 270 or -90, clockwise), { "op": "delete", "pages": "4" }, { "op": "move", "pages": "5", "to": 1 } (they go before page "to"; the page count + 1 for the end), { "op": "insert", "after": 2, "count": 1, "size": [595, 842] } (blank pages; size optional, in points), { "op": "merge", "file": "other.pdf", "after": 3, "pages": "1-2" } (after optional: at the end).',
        items: { type: 'object' },
      },
      extract: { type: 'string', description: 'Instead of ops: these pages ("1-3, 7") into a new file.' },
      split: {
        type: 'object',
        description: 'Instead of ops: { "every": 1 } (a file per page, or per n pages) or { "ranges": ["1-3", "4-9"] }; the files go beside the PDF, "name (part 1).pdf"…',
        properties: { every: { type: 'integer' }, ranges: { type: 'array', items: { type: 'string' } } },
      },
      ...SAVE_PROPS,
    },
    required: ['path'],
  },
  async run(a, ctx) {
    const file = fromSession(ctx.cwd, a.path);
    const pdf = readPdf(file);
    const count = pdfInfo(pdf).pages.length;
    const stem = path.basename(file, path.extname(file));
    if (a.split && typeof a.split === 'object') {
      const parts = splitPdf(pdf, { every: Number(a.split.every) || undefined, ranges: Array.isArray(a.split.ranges) ? a.split.ranges.map(String) : undefined });
      const dir = typeof a.save_as === 'string' && a.save_as.trim() ? fromSession(ctx.cwd, a.save_as) : path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      const out: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const dest = freeName(dir, `${stem} (part ${i + 1}).pdf`);
        await writeFile(dest, parts[i], { create: true });
        out.push(dest);
      }
      return `Split ${path.basename(file)} into ${parts.length} files:\n${out.join('\n')}`;
    }
    if (typeof a.extract === 'string' && a.extract.trim()) {
      const r = extractPages(pdf, pageList(a.extract, count));
      const where = await save(file, r.data, a, `pages ${a.extract.replace(/\s+/g, '')}`, ctx.cwd);
      return [`Took ${r.pages} page${r.pages === 1 ? '' : 's'} into ${where}.`, ...r.notes].join('\n');
    }
    if (!Array.isArray(a.ops) || !a.ops.length) throw new Error('Give ops (a list of changes), extract (pages to take out into a file) or split.');
    const ops: PageOp[] = a.ops.map((o: Record<string, unknown>, i: number) => {
      const pagesOf = (v: unknown, n: number) => pageList(typeof v === 'number' ? v : Array.isArray(v) ? (v as number[]) : String(v ?? ''), n);
      switch (o?.op) {
        case 'rotate':
          return { op: 'rotate', pages: o.pages === undefined || o.pages === 'all' ? [] : pagesOf(o.pages, 100_000), angle: Number(o.angle ?? 90) };
        case 'delete':
          return { op: 'delete', pages: pagesOf(o.pages, 100_000) };
        case 'move':
          return { op: 'move', pages: pagesOf(o.pages, 100_000), to: Number(o.to) };
        case 'insert':
          return { op: 'insert', after: Number(o.after ?? 0), count: Number(o.count ?? 1), size: Array.isArray(o.size) && o.size.length === 2 ? [Number(o.size[0]), Number(o.size[1])] : undefined };
        case 'merge': {
          const other = fromSession(ctx.cwd, o.file);
          return { op: 'merge', file: readPdf(other), after: o.after === undefined ? undefined : Number(o.after), pages: o.pages === undefined ? undefined : pagesOf(o.pages, 100_000) };
        }
        default:
          throw new Error(`ops[${i}]: op is rotate, delete, move, insert or merge.`);
      }
    });
    const r = editPages(pdf, ops);
    const where = await save(file, r.data, a, 'edited', ctx.cwd);
    return [`Saved ${where}: ${r.pages} page${r.pages === 1 ? '' : 's'} (it had ${count}).`, ...r.notes, 'Look at the pages with pdf_look to check them.'].join('\n');
  },
};

/** The PDF tools, with what agents are told of them when they start. */
export const PDF_TOOLS: RunTool[] = [LOOK, FORM, FILL, WRITE, PAGES];

export const PDF_INSTRUCTIONS =
  'PDFs: pdf_look shows a PDF’s pages as pictures with their fields and words placed; pdf_form lists its form fields, pdf_fill fills them, pdf_write writes on its pages (for forms that are only printed: text beside the words printed, ticks, pictures, white boxes; also highlights and comments), and pdf_pages rotates, deletes, moves, merges, extracts or splits pages. They save a copy beside the file unless asked to replace it.';
