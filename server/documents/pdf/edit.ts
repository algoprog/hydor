// Page operations, each saved as a whole new file: rotate pages, take them out, move them, put blank ones in, merge
// other PDFs in, and take some pages out into a file of their own (or split a file into several). Each page keeps
// what it inherited (its resources, boxes and rotation), its annotations and its form fields; bookmarks and links to
// pages that are gone lead nowhere instead of to a stray page. A new file cannot keep a digital signature: signatures
// already in it are taken out (their fields stay, empty, to sign again), and the note says so. A file encrypted with
// an empty user password stays encrypted the same way.
import { PdfError, PdfFile, Rewriter } from './file.ts';
import { Dict, dict, isDict, isRef, type Obj, Ref, Str, textStr } from './objects.ts';
import { type Page, pages } from './pages.ts';

export type PageOp =
  | { op: 'rotate'; pages: number[]; angle: number }
  | { op: 'delete'; pages: number[] }
  | { op: 'move'; pages: number[]; to: number }
  | { op: 'insert'; after: number; count?: number; size?: [number, number] }
  | { op: 'merge'; file: Buffer; after?: number; pages?: number[]; name?: string };

interface Slot {
  file: PdfFile;
  page: Page | null;
  rotate: number;
  size: [number, number];
}

export interface Edited {
  data: Buffer;
  pages: number;
  notes: string[];
}

/** Pages "1-3, 5" (from 1) of a file of `count` pages; throws for pages it does not have. */
export function pageList(spec: string | number | number[], count: number): number[] {
  const out: number[] = [];
  const add = (n: number) => {
    if (!Number.isInteger(n) || n < 1 || n > count) throw new PdfError(`There is no page ${n}: the file has ${count} page${count === 1 ? '' : 's'}.`);
    out.push(n);
  };
  if (typeof spec === 'number') add(spec);
  else if (Array.isArray(spec)) spec.forEach((n) => add(Number(n)));
  else
    for (const part of String(spec)
      .split(/[,\s]+/)
      .filter(Boolean)) {
      if (part === 'all') for (let i = 1; i <= count; i++) add(i);
      else if (/^\d+\s*[-–]\s*(\d+|end)$/.test(part)) {
        const [a, b] = part.split(/[-–]/).map((x) => x.trim());
        const to = b === 'end' ? count : Number(b);
        for (let i = Number(a); i <= to; i++) add(i);
      } else add(Number(part));
    }
  return out;
}

/** Applies the operations in order to the file's pages; the new file. */
export function editPages(src: Buffer, ops: PageOp[]): Edited {
  const base = new PdfFile(src);
  const perms = base.permissions();
  if (perms && !perms.assemble) throw new PdfError('The file’s owner protected it against changing its pages (it is encrypted with permissions that do not allow it).');
  let slots: Slot[] = pages(base).map((p) => ({ file: base, page: p, rotate: p.rotate, size: [p.width, p.height] }));
  const notes: string[] = [];
  const others: PdfFile[] = [];
  for (const op of ops) {
    const count = slots.length;
    if (op.op === 'rotate') {
      const a = (((Math.round(op.angle / 90) * 90) % 360) + 360) % 360;
      if (!a) throw new PdfError('Rotate by 90, 180 or 270 degrees (or -90).');
      for (const n of new Set(op.pages.length ? op.pages : pageList('all', count))) {
        pageList([n], count);
        const s = slots[n - 1];
        s.rotate = (s.rotate + a) % 360;
        if (a !== 180) s.size = [s.size[1], s.size[0]];
      }
    } else if (op.op === 'delete') {
      const gone = new Set(pageList(op.pages, count));
      if (gone.size >= count) throw new PdfError('That would take out every page: a PDF needs at least one.');
      slots = slots.filter((_, i) => !gone.has(i + 1));
    } else if (op.op === 'move') {
      const moving = [...new Set(pageList(op.pages, count))].sort((a, b) => a - b);
      const to = Math.round(op.to);
      if (!(to >= 1 && to <= count + 1)) throw new PdfError(`"to" is the page they go before, from 1 to ${count + 1} (${count + 1}: at the end).`);
      const picked = moving.map((n) => slots[n - 1]);
      // They go before page "to"; when it moves too, before the first page after it that stays.
      let k = to - 1;
      while (k < count && picked.includes(slots[k])) k++;
      const anchor = k < count ? slots[k] : null;
      const rest = slots.filter((s) => !picked.includes(s));
      rest.splice(anchor ? rest.indexOf(anchor) : rest.length, 0, ...picked);
      slots = rest;
    } else if (op.op === 'insert') {
      const after = Math.round(op.after);
      if (!(after >= 0 && after <= count)) throw new PdfError(`"after" is the page the blank pages go after, from 0 (at the start) to ${count}.`);
      const like = slots[Math.max(0, after - 1)];
      const size: [number, number] = op.size ?? like?.size ?? [595.28, 841.89];
      const n = Math.max(1, Math.min(200, Math.round(op.count ?? 1)));
      slots.splice(after, 0, ...Array.from({ length: n }, () => ({ file: base, page: null, rotate: 0, size: [size[0], size[1]] as [number, number] })));
    } else if (op.op === 'merge') {
      const other = new PdfFile(op.file);
      others.push(other);
      const theirs = pages(other);
      const picked = op.pages?.length ? pageList(op.pages, theirs.length).map((n) => theirs[n - 1]) : theirs;
      const after = op.after === undefined ? count : Math.round(op.after);
      if (!(after >= 0 && after <= count)) throw new PdfError(`"after" is the page the merged pages go after, from 0 (at the start) to ${count}.`);
      slots.splice(after, 0, ...picked.map((p) => ({ file: other, page: p, rotate: p.rotate, size: [p.width, p.height] as [number, number] })));
    }
  }
  const { data, dropped } = writePages(base, slots, [base, ...others]);
  if (dropped)
    notes.push(`The file had ${dropped === 1 ? 'a digital signature' : `${dropped} digital signatures`}, which a changed file cannot keep: ${dropped === 1 ? 'it was' : 'they were'} taken out (the signature fields stay, empty, to sign again).`);
  return { data, pages: slots.length, notes };
}

/** These pages (from 1, in this order) as a file of their own. */
export function extractPages(src: Buffer, list: number[]): Edited {
  const base = new PdfFile(src);
  const all = pages(base);
  const slots = pageList(list, all.length).map((n) => ({ file: base, page: all[n - 1], rotate: all[n - 1].rotate, size: [all[n - 1].width, all[n - 1].height] as [number, number] }));
  const { data, dropped } = writePages(base, slots, [base]);
  return { data, pages: slots.length, notes: dropped ? ['Digital signatures do not come along into a file made of some of the pages.'] : [] };
}

/** The file split into parts: `every` pages each, or at the given ranges ("1-3", "4-9"). */
export function splitPdf(src: Buffer, o: { every?: number; ranges?: string[] }): Buffer[] {
  const base = new PdfFile(src);
  const count = pages(base).length;
  const parts: number[][] = [];
  if (o.ranges?.length) for (const r of o.ranges) parts.push(pageList(r, count));
  else {
    const every = Math.max(1, Math.round(o.every ?? 1));
    for (let i = 1; i <= count; i += every) parts.push(Array.from({ length: Math.min(every, count - i + 1) }, (_, k) => i + k));
  }
  if (parts.length > 500) throw new PdfError('That would make more than 500 files.');
  return parts.map((p) => extractPages(src, p).data);
}

/** The pages written as a new file: the first file's catalog, info and encryption, the pages in their order. */
function writePages(base: PdfFile, slots: Slot[], files: PdfFile[]): { data: Buffer; dropped: number } {
  const enc = base.crypt ? base.dictOf(base.trailer.get('Encrypt') ?? null) : null;
  const id = base.resolve(base.trailer.get('ID') ?? null);
  const version = Number(base.version) >= 1.4 ? base.version : '1.4';
  const w = new Rewriter(base.crypt, enc, Array.isArray(id) && id.every((x) => x instanceof Str) ? (id as Obj[]) : null, version);
  const pagesRef = w.reserve();
  // What stays out: pages not kept, and the old page trees' own nodes.
  const kept = new Map<PdfFile, Set<number>>();
  for (const s of slots) if (s.page) (kept.get(s.file) ?? kept.set(s.file, new Set()).get(s.file)!).add(s.page.ref.num);
  for (const f of files) {
    const own = kept.get(f) ?? new Set();
    for (const p of pages(f)) if (!own.has(p.ref.num)) w.dropObject(f, p.ref.num);
    dropTree(f, w);
  }
  // Numbers first, for the kept pages and fields, so whatever refers to them (links, a widget's page, a page's
  // widgets) leads to their new copies: a page's annotations and its form's fields must be the same objects.
  const pageRefs = slots.map((s) => {
    if (!s.page) return null;
    const r = w.reserve();
    w.alias(s.file, s.page.ref.num, r);
    return r;
  });
  let dropped = 0;
  const tops: { f: PdfFile; first: boolean; nodes: FieldPlan[] }[] = [];
  let af: { f: PdfFile; d: Dict } | null = null;
  files.forEach((f, i) => {
    const fa = f.dictOf(f.catalog().get('AcroForm') ?? null);
    if (!fa) return;
    if (!af) af = { f, d: new Dict(fa) };
    const own = kept.get(f) ?? new Set<number>();
    const nodes: FieldPlan[] = [];
    for (const top of f.arrayOf(fa.get('Fields') ?? null)) if (isRef(top)) planField(f, top, own, w, nodes, 0);
    tops.push({ f, first: i === 0, nodes });
  });
  // The fields' copies, with their kids still on a page and signatures taken off.
  const fieldRefs: Ref[] = [];
  const names = new Set<string>();
  for (const { f, first, nodes } of tops) {
    for (const n of nodes) {
      const nd = new Dict(n.dict);
      nd.delete('Kids');
      if (f.resolve(n.dict.get('FT') ?? null) === 'Sig' && n.dict.has('V')) {
        nd.delete('V');
        nd.delete('Lock');
        // Its look showed the signer: an empty box now.
        nd.delete('AP');
        dropped++;
      }
      const copy = w.copy(f, nd) as Dict;
      // Its kids are already new references: set after the copy, which would map them again.
      if (n.kids) copy.set('Kids', n.kids);
      if (n.top) {
        // Two files with a field of the same name: the later one's gets a number.
        const t = n.dict.get('T');
        const name = t instanceof Str ? t.text() : '';
        if (name && names.has(name) && !first) {
          let k = 2;
          while (names.has(`${name}_${k}`)) k++;
          copy.set('T', textStr(`${name}_${k}`));
          names.add(`${name}_${k}`);
        } else if (name) names.add(name);
        fieldRefs.push(n.ref);
      }
      w.set(n.ref, copy);
    }
  }
  // The pages: what each inherited made its own, under the new tree.
  const kids: Ref[] = [];
  slots.forEach((s, i) => {
    if (!s.page) {
      kids.push(w.add(dict({ Type: 'Page', Parent: pagesRef, MediaBox: [0, 0, s.size[0], s.size[1]], Resources: new Dict() })));
      return;
    }
    const p = s.page;
    const d = new Dict(s.file.dictOf(p.ref) ?? p.dict);
    d.delete('Parent');
    if (!d.has('Resources')) d.set('Resources', p.resources);
    if (!d.has('MediaBox')) d.set('MediaBox', [p.media.x0, p.media.y0, p.media.x1, p.media.y1]);
    if (!d.has('CropBox') && (p.crop.x0 !== p.media.x0 || p.crop.y0 !== p.media.y0 || p.crop.x1 !== p.media.x1 || p.crop.y1 !== p.media.y1)) d.set('CropBox', [p.crop.x0, p.crop.y0, p.crop.x1, p.crop.y1]);
    if (s.rotate) d.set('Rotate', s.rotate);
    else d.delete('Rotate');
    // Article threads' beads point into a tree that is not carried over.
    d.delete('B');
    const copied = w.copy(s.file, d) as Dict;
    copied.set('Parent', pagesRef);
    w.set(pageRefs[i]!, copied);
    kids.push(pageRefs[i]!);
  });
  w.set(pagesRef, dict({ Type: 'Pages', Kids: kids, Count: kids.length }));
  // The catalog: the first file's, with a form made of the fields still on a page.
  const cat = new Dict(base.catalog());
  for (const k of ['Pages', 'AcroForm', 'Perms', 'PageLabels', 'Threads']) cat.delete(k);
  const catCopy = w.copy(base, cat) as Dict;
  catCopy.set('Pages', pagesRef);
  const form = af as { f: PdfFile; d: Dict } | null;
  if (form) {
    const a = new Dict(form.d);
    a.delete('XFA');
    a.delete('Fields');
    if (dropped) a.delete('SigFlags');
    const ac = w.copy(form.f, a) as Dict;
    ac.set('Fields', fieldRefs);
    catCopy.set('AcroForm', w.add(ac));
  }
  const root = w.add(catCopy);
  const info = base.trailer.get('Info');
  const infoRef = isRef(info) ? w.ref(base, info) : null;
  return { data: w.finish(root, infoRef), dropped };
}

interface FieldPlan {
  ref: Ref;
  dict: Dict;
  /** The kids still there (new references), when it has kids. */
  kids: Ref[] | null;
  top: boolean;
}

/**
 * Plans a field's copy: which of its parts are still on a page (a widget on a page taken out goes), each given its
 * new number now. Kids come before their parents in `out`. False when nothing of it is left.
 */
function planField(f: PdfFile, r: Ref, keptPages: Set<number>, w: Rewriter, out: FieldPlan[], depth: number): boolean {
  const d = f.dictOf(r);
  if (!d || depth > 32) return false;
  const kids = f.arrayOf(d.get('Kids') ?? null).filter(isRef);
  let keptKids: Ref[] | null = null;
  // The number is taken before the kids', so they can point at their parent.
  const to = w.reserve();
  w.alias(f, r.num, to);
  if (kids.length) {
    keptKids = [];
    for (const k of kids) if (planField(f, k, keptPages, w, out, depth + 1)) keptKids.push(w.ref(f, k)!);
    if (!keptKids.length) {
      w.dropObject(f, r.num);
      return false;
    }
  } else if (d.get('Subtype') === 'Widget' || d.has('Rect')) {
    const onPage = pageOfWidget(f, r, d);
    if (onPage !== null && !keptPages.has(onPage)) {
      w.dropObject(f, r.num);
      return false;
    }
  }
  out.push({ ref: to, dict: d, kids: keptKids, top: depth === 0 });
  return true;
}

/** The old page tree's own nodes stay out of the new file. */
function dropTree(f: PdfFile, w: Rewriter) {
  const seen = new Set<number>();
  const walk = (r: Obj, depth: number) => {
    if (!isRef(r) || seen.has(r.num) || depth > 64) return;
    seen.add(r.num);
    const d = f.dictOf(r);
    if (!d || d.get('Type') === 'Page') return;
    w.dropObject(f, r.num);
    for (const k of f.arrayOf(d.get('Kids') ?? null)) walk(k, depth + 1);
  };
  walk(f.catalog().get('Pages') ?? null, 0);
}

const widgetPages = new WeakMap<PdfFile, Map<number, number>>();
/** The page (its object's number) a widget is on, or null when it is on none. */
function pageOfWidget(f: PdfFile, r: Ref, d: Dict): number | null {
  let m = widgetPages.get(f);
  if (!m) {
    m = new Map();
    for (const p of pages(f)) for (const a of f.arrayOf(p.dict.get('Annots') ?? null)) if (isRef(a)) m.set(a.num, p.ref.num);
    widgetPages.set(f, m);
  }
  const p = d.get('P');
  return m.get(r.num) ?? (isRef(p) ? p.num : null);
}
