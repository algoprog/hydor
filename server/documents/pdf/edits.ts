// What a save adds to pages: drawing appended to a page's content (in points from the page's bottom-left as it shows,
// so rotated pages need nothing special), the fonts, pictures and graphics states it uses, and annotations added or
// taken off. The page's own content is wrapped in q … Q first, so whatever state it leaves does not move what is
// added. Each page changed gets a new version of its dictionary; its old content streams stay as they were.
import crypto from 'node:crypto';
import type { PdfFile } from './file.ts';
import { flateStream } from './filters.ts';
import { Dict, isRef, num, type Obj, Stream } from './objects.ts';
import type { Page } from './pages.ts';

export class PageEdit {
  /** Content operators, in display space. */
  ops: string[] = [];
  private names = new Map<string, Map<string, Obj>>();
  annots: Obj[] = [];
  remove = new Set<number>();
  private tag = crypto.randomBytes(2).toString('hex');
  private count = 0;
  constructor(readonly page: Page) {}

  /** Puts a resource in (a font, a picture, a graphics state) under a name of its own; the name. */
  resource(kind: 'Font' | 'XObject' | 'ExtGState', o: Obj, name?: string): string {
    let m = this.names.get(kind);
    if (!m) this.names.set(kind, (m = new Map()));
    for (const [k, v] of m) if (v === o || (isRef(v) && isRef(o) && v.num === o.num)) return k;
    const n = name ?? `H${this.tag}${kind[0]}${++this.count}`;
    m.set(n, o);
    return n;
  }

  get empty(): boolean {
    return !this.ops.length && !this.annots.length && !this.remove.size && !this.names.size;
  }

  resources(): Map<string, Map<string, Obj>> {
    return this.names;
  }
}

/** The edits of one save, page by page. */
export class PageEdits {
  private map = new Map<number, PageEdit>();
  constructor(private pdf: PdfFile) {}

  page(p: Page): PageEdit {
    let e = this.map.get(p.index);
    if (!e) this.map.set(p.index, (e = new PageEdit(p)));
    return e;
  }

  get pages(): PageEdit[] {
    return [...this.map.values()];
  }

  /** Writes each changed page: its content with what was drawn, its resources and its annotations. */
  finish() {
    const pdf = this.pdf;
    for (const e of this.map.values()) {
      if (e.empty) continue;
      const p = e.page;
      const cur = pdf.dictOf(p.ref) ?? p.dict;
      const d = new Dict(cur);
      if (e.ops.length) {
        const raw = cur.get('Contents');
        const old = pdf.resolve(raw ?? null);
        const list: Obj[] = Array.isArray(old) ? [...old] : raw !== undefined && raw !== null ? [raw] : [];
        const draw = `q ${p.toUser.map(num).join(' ')} cm\n${e.ops.join('\n')}\nQ\n`;
        if (list.length) {
          const before = pdf.add(new Stream(new Dict(), Buffer.from('q\n')));
          const after = pdf.add(flateStream(Buffer.from(`Q\n${draw}`, 'latin1')));
          d.set('Contents', [before, ...list, after]);
        } else d.set('Contents', pdf.add(flateStream(Buffer.from(draw, 'latin1'))));
      }
      const res = e.resources();
      if (res.size) {
        const base = pdf.dictOf(cur.get('Resources') ?? null) ?? p.resources;
        const r = new Dict(base);
        for (const [kind, entries] of res) {
          const sub = new Dict(pdf.dictOf(base.get(kind) ?? null) ?? new Dict());
          for (const [k, v] of entries) sub.set(k, v);
          r.set(kind, sub);
        }
        // Pictures and text need their procedure sets named for very old viewers.
        if (!r.has('ProcSet')) r.set('ProcSet', ['PDF', 'Text', 'ImageB', 'ImageC', 'ImageI']);
        d.set('Resources', r);
      }
      if (e.annots.length || e.remove.size) {
        const old = pdf.arrayOf(cur.get('Annots') ?? null).filter((a) => !(isRef(a) && e.remove.has(a.num)));
        const all = [...old, ...e.annots];
        if (all.length) d.set('Annots', all);
        else d.delete('Annots');
      }
      pdf.set(p.ref, d);
    }
  }
}
